const SUBSTACK_ARCHIVE_URL =
  "https://lorenzoroque.substack.com/api/v1/archive?sort=new&offset=0&limit=1";
const SIGNAL_KEY = "lorenzo-roque-substack";
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
    const requestBody = await request.json().catch(() => null);
    if (requestBody?.signalKey !== SIGNAL_KEY) {
      return jsonResponse({ error: "Unsupported signal key." }, 400);
    }

    const archiveResponse = await fetch(SUBSTACK_ARCHIVE_URL, {
      headers: { Accept: "application/json" }
    });
    if (!archiveResponse.ok) {
      return jsonResponse(
        { error: `Substack returned HTTP ${archiveResponse.status}.` },
        502
      );
    }

    const archiveRows = await archiveResponse.json();
    const latestPost = Array.isArray(archiveRows) ? archiveRows[0] : null;
    const publishedAt = String(latestPost?.post_date || latestPost?.postDate || "").trim();
    if (!Number.isFinite(Date.parse(publishedAt))) {
      return jsonResponse({ error: "Substack returned no valid publication date." }, 502);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase server credentials are unavailable." }, 500);
    }

    const rpcResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/record_external_signal_if_newer`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_signal_key: SIGNAL_KEY,
          p_latest_entry_at: new Date(publishedAt).toISOString(),
          p_latest_entry_title: String(latestPost?.title || ""),
          p_latest_entry_url: String(
            latestPost?.canonical_url ||
              latestPost?.canonicalUrl ||
              (latestPost?.slug
                ? `https://lorenzoroque.substack.com/p/${latestPost.slug}`
                : "")
          ),
          p_source: "edge-function"
        })
      }
    );
    if (!rpcResponse.ok) {
      return jsonResponse(
        { error: `Signal cache update returned HTTP ${rpcResponse.status}.` },
        502
      );
    }

    return jsonResponse({ signal: await rpcResponse.json() });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Signal refresh failed." },
      500
    );
  }
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}
