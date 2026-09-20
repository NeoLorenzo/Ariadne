import {
  buildAdzunaSearchUrl,
  evaluateAdzunaCandidate,
  normalizeAdzunaJob,
  normalizeRequestedQueries,
  type NormalizedAdzunaCandidate
} from "./adzuna.ts";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const owner = await getAuthorizedOwner(request);
    if (!owner) {
      return jsonResponse({ error: "Not authorized." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const queries = normalizeRequestedQueries(body?.queries);
    const resultsPerQuery = clampInteger(body?.resultsPerQuery, 1, 25, 10);
    const dryRun = body?.dryRun === true;

    const appId = requiredEnv("ADZUNA_APP_ID");
    const appKey = requiredEnv("ADZUNA_APP_KEY");
    const runStartedAt = new Date();
    const discovered = new Map<string, NormalizedAdzunaCandidate>();
    const filteredReasons = new Map<string, number>();
    const queryErrors: Array<{ query: string; error: string }> = [];
    let fetchedCount = 0;
    let filteredCount = 0;

    for (const query of queries) {
      try {
        const response = await fetch(
          buildAdzunaSearchUrl({
            appId,
            appKey,
            query,
            resultsPerPage: resultsPerQuery
          }),
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "Ariadne-Adzuna-Discovery/1.0"
            }
          }
        );

        if (!response.ok) {
          const retryAfter = response.headers.get("retry-after");
          throw new Error(
            `Adzuna returned HTTP ${response.status}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}.`
          );
        }

        const payload = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : [];
        fetchedCount += results.length;

        for (const rawJob of results) {
          const candidate = normalizeAdzunaJob(rawJob, {
            query,
            now: runStartedAt
          });
          const evaluation = evaluateAdzunaCandidate(candidate);
          if (!evaluation.keep) {
            filteredCount += 1;
            for (const reason of evaluation.reasons) {
              filteredReasons.set(reason, (filteredReasons.get(reason) || 0) + 1);
            }
            continue;
          }

          const identity = candidate.sourceExternalId || candidate.sourceUrl;
          if (!identity) continue;

          const existing = discovered.get(identity);
          if (!existing) {
            discovered.set(identity, candidate);
            continue;
          }

          discovered.set(identity, mergeDiscoveryQueries(existing, candidate));
        }
      } catch (error) {
        queryErrors.push({
          query,
          error: error instanceof Error ? error.message : "Unknown Adzuna error."
        });
      }
    }

    if (queryErrors.length === queries.length) {
      return jsonResponse(
        {
          error: "All Adzuna searches failed.",
          queryErrors
        },
        502
      );
    }

    const candidates = [...discovered.values()];
    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        queries: queries.length,
        fetched: fetchedCount,
        uniqueRelevant: candidates.length,
        filtered: filteredCount,
        filteredReasons: Object.fromEntries(filteredReasons),
        queryErrors,
        examples: candidates.slice(0, 20).map(candidateSummary)
      });
    }

    let created = 0;
    let refreshed = 0;
    const duplicateReasons = new Map<string, number>();
    const ingestErrors: Array<{ externalId: string; title: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        const result = await ingestCandidate(owner.userId, candidate);
        if (result?.created === true) {
          created += 1;
        } else {
          refreshed += 1;
          const reason = String(result?.duplicate_reason || "unknown");
          duplicateReasons.set(reason, (duplicateReasons.get(reason) || 0) + 1);
        }
      } catch (error) {
        ingestErrors.push({
          externalId: candidate.sourceExternalId,
          title: candidate.title,
          error: error instanceof Error ? error.message : "Candidate ingestion failed."
        });
      }
    }

    return jsonResponse({
      dryRun: false,
      queries: queries.length,
      fetched: fetchedCount,
      uniqueRelevant: candidates.length,
      filtered: filteredCount,
      filteredReasons: Object.fromEntries(filteredReasons),
      created,
      refreshed,
      duplicateReasons: Object.fromEntries(duplicateReasons),
      queryErrors,
      ingestErrors,
      examples: candidates.slice(0, 10).map(candidateSummary)
    });
  } catch (error) {
    console.error("adzuna-job-discovery failed", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Adzuna job discovery failed."
      },
      500
    );
  }
});

function mergeDiscoveryQueries(
  existing: NormalizedAdzunaCandidate,
  incoming: NormalizedAdzunaCandidate
) {
  const existingQuery = String(existing.sourcePayload?.discovery_query || "").trim();
  const incomingQuery = String(incoming.sourcePayload?.discovery_query || "").trim();
  const previousQueries = Array.isArray(existing.sourcePayload?.discovery_queries)
    ? existing.sourcePayload.discovery_queries.map(String)
    : [];
  const queries = [...new Set([...previousQueries, existingQuery, incomingQuery].filter(Boolean))];

  return {
    ...existing,
    sourcePayload: {
      ...existing.sourcePayload,
      discovery_queries: queries
    }
  };
}

function candidateSummary(candidate: NormalizedAdzunaCandidate) {
  return {
    externalId: candidate.sourceExternalId,
    title: candidate.title,
    organization: candidate.organization,
    type: candidate.type,
    sourceUrl: candidate.sourceUrl,
    location: candidate.sourcePayload?.location || ""
  };
}

async function ingestCandidate(userId: string, candidate: NormalizedAdzunaCandidate) {
  return await adminJson("/rest/v1/rpc/ingest_opportunity_candidate", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_candidate_id: candidate.id,
      p_source_type: candidate.sourceType,
      p_source_name: candidate.sourceName,
      p_title: candidate.title,
      p_type: candidate.type,
      p_content_hash: candidate.contentHash,
      p_source_external_id: candidate.sourceExternalId || null,
      p_source_url: candidate.sourceUrl || null,
      p_canonical_url: candidate.canonicalUrl || null,
      p_source_payload: candidate.sourcePayload || {},
      p_organization: candidate.organization || null,
      p_description: candidate.description || null,
      p_requirements: candidate.requirements || null,
      p_deadline: null,
      p_start_date: null,
      p_discovered_at: candidate.discoveredAt,
      p_last_seen_at: candidate.lastSeenAt
    })
  });
}

async function getAuthorizedOwner(request: Request) {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const publishableKey =
    request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authorization = request.headers.get("authorization");

  if (!publishableKey || !authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: authorization
    }
  });
  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  if (String(user?.email || "").trim().toLowerCase() !== AUTHORIZED_EMAIL) {
    return null;
  }

  const userId = String(user?.id || "").trim();
  return userId ? { userId, email: AUTHORIZED_EMAIL } : null;
}

async function adminJson(path: string, init: RequestInit = {}) {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${requiredEnv("SUPABASE_URL")}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Supabase request returned HTTP ${response.status}: ${message.slice(0, 400)}`
    );
  }
  if (response.status === 204) return null;
  return await response.json();
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name) || "";
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}
