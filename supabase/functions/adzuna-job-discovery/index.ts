import {
  annotateCandidateEvaluation,
  buildAdzunaSearchUrl,
  evaluateAdzunaCandidate,
  normalizeAdzunaJob,
  normalizeRequestedSearchProfiles,
  type AdzunaCandidateEvaluation,
  type AdzunaSearchProfile,
  type NormalizedAdzunaCandidate
} from "./adzuna.ts";

const AUTHORIZED_EMAIL = "theneolorenzo@gmail.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ariadne-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const FILTER_REASON_SET = new Set([
  "missing_title",
  "missing_external_id",
  "missing_source_url",
  "no_target_role_in_title",
  "seniority_penalty",
  "requires_5_plus_years",
  "wrong_occupation",
  "wrong_category",
  "below_threshold"
]);

type QueryStats = Record<string, {
  profileId: string;
  family: string;
  fetched: number;
  kept: number;
  filtered: number;
}>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const cronOwnerId = await getAuthorizedCronOwner(request);
    const owner = cronOwnerId
      ? { userId: cronOwnerId, email: AUTHORIZED_EMAIL }
      : await getAuthorizedOwner(request);
    if (!owner) {
      return jsonResponse({ error: "Not authorized." }, 403);
    }
    const searchProfiles = normalizeRequestedSearchProfiles(body?.queries);
    const resultsPerQuery = clampInteger(body?.resultsPerQuery, 1, 25, 10);
    const dryRun = body?.dryRun === true;

    const appId = requiredEnv("ADZUNA_APP_ID");
    const appKey = requiredEnv("ADZUNA_APP_KEY");
    const runStartedAt = new Date();
    const discovered = new Map<string, NormalizedAdzunaCandidate>();
    const filteredReasons = new Map<string, number>();
    const filteredExamples: Array<{
      profileId: string;
      query: string;
      title: string;
      organization: string;
      score: number;
      reasons: string[];
    }> = [];
    const queryErrors: Array<{ profileId: string; query: string; error: string }> = [];
    const queryStats: QueryStats = {};
    let fetchedCount = 0;
    let filteredCount = 0;

    for (const profile of searchProfiles) {
      queryStats[profile.query] = {
        profileId: profile.id,
        family: profile.family,
        fetched: 0,
        kept: 0,
        filtered: 0
      };

      try {
        const response = await fetch(
          buildAdzunaSearchUrl({
            appId,
            appKey,
            query: profile.query,
            whatExclude: profile.whatExclude,
            resultsPerPage: resultsPerQuery
          }),
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "Ariadne-Adzuna-Discovery/2.0"
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
        queryStats[profile.query].fetched += results.length;

        for (const rawJob of results) {
          const normalized = normalizeAdzunaJob(rawJob, {
            query: profile.query,
            profileId: profile.id,
            now: runStartedAt
          });
          const evaluation = evaluateAdzunaCandidate(normalized, profile);
          const candidate = annotateCandidateEvaluation(normalized, evaluation, profile);

          if (!evaluation.keep) {
            filteredCount += 1;
            queryStats[profile.query].filtered += 1;
            countFilteredReasons(filteredReasons, evaluation);

            if (filteredExamples.length < 30) {
              filteredExamples.push({
                profileId: profile.id,
                query: profile.query,
                title: candidate.title,
                organization: candidate.organization,
                score: evaluation.score,
                reasons: rejectionReasons(evaluation)
              });
            }
            continue;
          }

          queryStats[profile.query].kept += 1;
          const identity = candidate.sourceExternalId || candidate.sourceUrl;
          if (!identity) continue;

          const existing = discovered.get(identity);
          if (!existing) {
            discovered.set(identity, candidate);
            continue;
          }

          discovered.set(identity, mergeDiscoveryEvidence(existing, candidate));
        }
      } catch (error) {
        queryErrors.push({
          profileId: profile.id,
          query: profile.query,
          error: error instanceof Error ? error.message : "Unknown Adzuna error."
        });
      }
    }

    if (queryErrors.length === searchProfiles.length) {
      return jsonResponse(
        {
          error: "All Adzuna searches failed.",
          queryErrors
        },
        502
      );
    }

    const candidates = [...discovered.values()].sort(
      (left, right) =>
        Number(right.sourcePayload?.relevance_score || 0) -
        Number(left.sourcePayload?.relevance_score || 0)
    );

    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        searches: searchProfiles.length,
        fetched: fetchedCount,
        uniqueRelevant: candidates.length,
        filtered: filteredCount,
        filteredReasons: Object.fromEntries(filteredReasons),
        queryStats,
        queryErrors,
        examples: candidates.slice(0, 30).map(candidateSummary),
        filteredExamples
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
      searches: searchProfiles.length,
      fetched: fetchedCount,
      uniqueRelevant: candidates.length,
      filtered: filteredCount,
      filteredReasons: Object.fromEntries(filteredReasons),
      queryStats,
      created,
      refreshed,
      duplicateReasons: Object.fromEntries(duplicateReasons),
      queryErrors,
      ingestErrors,
      examples: candidates.slice(0, 20).map(candidateSummary),
      filteredExamples: filteredExamples.slice(0, 10)
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

function countFilteredReasons(
  accumulator: Map<string, number>,
  evaluation: AdzunaCandidateEvaluation
) {
  for (const reason of rejectionReasons(evaluation)) {
    accumulator.set(reason, (accumulator.get(reason) || 0) + 1);
  }
}

function rejectionReasons(evaluation: AdzunaCandidateEvaluation) {
  return evaluation.reasons.filter((reason) => FILTER_REASON_SET.has(reason));
}

function mergeDiscoveryEvidence(
  existing: NormalizedAdzunaCandidate,
  incoming: NormalizedAdzunaCandidate
) {
  const existingScore = Number(existing.sourcePayload?.relevance_score || 0);
  const incomingScore = Number(incoming.sourcePayload?.relevance_score || 0);
  const preferred = incomingScore > existingScore ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;

  const queries = uniqueStrings([
    ...arrayOfStrings(existing.sourcePayload?.discovery_queries),
    existing.sourcePayload?.discovery_query,
    ...arrayOfStrings(incoming.sourcePayload?.discovery_queries),
    incoming.sourcePayload?.discovery_query
  ]);

  const profiles = uniqueStrings([
    ...arrayOfStrings(existing.sourcePayload?.discovery_profiles),
    existing.sourcePayload?.discovery_profile,
    ...arrayOfStrings(incoming.sourcePayload?.discovery_profiles),
    incoming.sourcePayload?.discovery_profile
  ]);

  return {
    ...preferred,
    sourcePayload: {
      ...secondary.sourcePayload,
      ...preferred.sourcePayload,
      discovery_queries: queries,
      discovery_profiles: profiles,
      relevance_score: Math.max(existingScore, incomingScore)
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
    location: candidate.sourcePayload?.location || "",
    profile: candidate.sourcePayload?.discovery_profile || "",
    query: candidate.sourcePayload?.discovery_query || "",
    relevanceScore: Number(candidate.sourcePayload?.relevance_score || 0),
    relevanceReasons: candidate.sourcePayload?.relevance_reasons || []
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

async function getAuthorizedCronOwner(request: Request) {
  const suppliedSecret = request.headers.get("x-ariadne-cron-secret") || "";
  if (!suppliedSecret) {
    return null;
  }

  try {
    const ownerId = await adminJson("/rest/v1/rpc/authorize_adzuna_job_discovery_cron", {
      method: "POST",
      body: JSON.stringify({ p_secret: suppliedSecret })
    });
    const normalized = String(ownerId || "").trim();
    return normalized || null;
  } catch (error) {
    console.error("Adzuna cron authorization failed", error);
    return null;
  }
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

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
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
