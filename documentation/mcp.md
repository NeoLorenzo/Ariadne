# Ariadne MCP

Ariadne exposes a private, read-only Model Context Protocol (MCP) endpoint from a Supabase Edge Function. The GitHub Pages frontend remains a static deployment; MCP does not add server credentials to the browser bundle.

## Runtime

- Edge Function: `supabase/functions/ariadne-mcp`
- Transport: MCP Streamable HTTP via the official TypeScript SDK
- MCP SDK: `@modelcontextprotocol/server@2.0.0`
- Protocol support: current 2026 MCP plus the SDK's stateless legacy compatibility path
- Data source: Ariadne's existing Supabase tables
- Authorization: existing `public.is_ariadne_owner()` policy boundary
- Writes: none in v1

## Endpoint

After deployment, the MCP URL is:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/ariadne-mcp
```

For the production Ariadne project, substitute its project ref for `<SUPABASE_PROJECT_REF>`.

## Authentication

Every MCP request must send the access token from an authenticated Ariadne Supabase session:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

The Edge Function calls `public.is_ariadne_owner()` with that token before MCP handling begins. All subsequent reads use the same bearer token and the Supabase publishable/anon key, so normal row-level security remains active. The function does not use the service-role key.

A non-owner, missing token, invalid token, or expired token is rejected before Ariadne data is read.

Supabase access tokens expire. A long-running Grokbot integration must refresh the owner's Supabase session and replace the bearer token when it expires. A separate durable machine-auth credential is intentionally not introduced in this first read-only implementation.

## Exposed tools

| Tool | Purpose |
| --- | --- |
| `get_strategy` | Active direction, strategic objectives, outcome goals, and optional revision history |
| `get_projects` | Canonical project collection, optionally including archived projects |
| `get_tasks` | Canonical task collection with completed/deleted filtering and a bounded limit |
| `get_signals` | Cached external signals stored by Ariadne |
| `get_goat_lab` | Private GOAT Lab datasets, with a bounded per-dataset limit |
| `get_workspace_state` | Combined snapshot across selected Ariadne domains |

All tools are annotated as read-only and idempotent. There is no raw SQL, arbitrary table selector, or generic database mutation tool.

## Exposed resources

```text
ariadne://strategy
ariadne://projects
ariadne://tasks
ariadne://signals
ariadne://goat-lab
ariadne://workspace
```

Resources return `application/json` text backed by the same canonical Supabase tables as the application.

## Deploy

From the repository root with the Supabase CLI authenticated and linked to the Ariadne project:

```bash
supabase functions deploy ariadne-mcp
```

JWT verification should remain enabled. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by the Edge Function runtime.

### Browser-origin access

Normal server-to-server MCP clients generally do not send an `Origin` header and need no additional configuration.

If a browser-based MCP host must call the endpoint, explicitly allow its origin or hostname:

```bash
supabase secrets set ARIADNE_MCP_ALLOWED_ORIGINS="https://example.com"
```

Multiple values are comma-separated. `localhost` and `127.0.0.1` are allowed for local development. Arbitrary browser origins are rejected by default.

## Local development

Serve the function with the Supabase CLI:

```bash
supabase functions serve ariadne-mcp
```

The local MCP endpoint is typically:

```text
http://127.0.0.1:54321/functions/v1/ariadne-mcp
```

Use an access token for the authorized Ariadne account when testing authenticated reads.

## MCP client / Grokbot configuration

Configure the client with:

1. Transport: Streamable HTTP.
2. URL: the deployed `ariadne-mcp` function URL.
3. Header: `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`.
4. Refresh the Supabase session when the access token expires.

The client should then discover the tools and resources listed above through MCP. No application-state paste or rendered-UI scraping is required.

## Security invariants

- GitHub Pages remains static.
- No Supabase service-role key is used by this MCP function.
- The bearer token is verified against Ariadne's existing owner helper before MCP handling.
- Reads continue through Supabase RLS under the caller's JWT.
- Table access is hard-coded to the Ariadne domains intentionally exposed by this function.
- `user_id` is removed from MCP results where it is only an internal ownership key.
- Browser origins are denied unless local or explicitly configured.
- V1 is read-only. Any future mutation tool must represent an existing bounded Ariadne operation and validate its input.
