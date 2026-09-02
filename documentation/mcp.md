# Ariadne MCP for ChatGPT

Ariadne exposes a private, read-only Model Context Protocol (MCP) endpoint from a Supabase Edge Function. The integration target is ChatGPT. The GitHub Pages frontend remains a static deployment; MCP does not add server credentials to the browser bundle.

## Runtime

- Edge Function: `supabase/functions/ariadne-mcp`
- Transport: MCP Streamable HTTP via the official TypeScript SDK
- MCP SDK: `@modelcontextprotocol/server@2.0.0`
- Data source: Ariadne's existing Supabase tables
- Authorization boundary: existing `public.is_ariadne_owner()` policy plus Supabase RLS
- Writes: none in v1

## Endpoint

After deployment, the MCP URL is:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/ariadne-mcp
```

For the production Ariadne project, substitute its project ref for `<SUPABASE_PROJECT_REF>`.

## ChatGPT integration target

The intended client is a custom Ariadne app in ChatGPT using the remote MCP endpoint above. ChatGPT should be able to discover the exposed Ariadne tools and retrieve structured workspace state directly rather than relying on copied exports or rendered-UI scraping.

ChatGPT custom MCP availability is controlled by OpenAI account/workspace capabilities and may change independently of this repository. Follow OpenAI's current Developer Mode / custom app documentation when connecting the endpoint.

## Authentication

### Current development authentication

The deployed MCP currently accepts a bearer token from an authenticated Ariadne Supabase session:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

The Edge Function calls `public.is_ariadne_owner()` with that token before MCP handling begins. All subsequent reads use the same bearer token and the Supabase publishable/anon key, so normal row-level security remains active. The function does not use the service-role key.

A non-owner, missing token, invalid token, or expired token is rejected before Ariadne data is read.

This bearer-token path is useful for local and protocol testing, but manually copying a short-lived Supabase access token is not the intended final ChatGPT connection flow.

### Target ChatGPT authentication

The durable target is standards-based OAuth 2.1 / OpenID Connect using Ariadne's existing Supabase Auth identity. Supabase Auth can act as an OAuth 2.1 authorization server, issue refreshable access tokens, preserve the existing user identity, and continue applying Ariadne's RLS policies.

The intended final flow is:

1. ChatGPT connects to the Ariadne remote MCP endpoint.
2. Ariadne advertises or is configured with the Supabase OAuth authorization server.
3. ChatGPT redirects the owner through the Ariadne/Supabase authorization flow.
4. Supabase issues access and refresh tokens after authorization.
5. ChatGPT presents the resulting bearer access token to the MCP endpoint.
6. Ariadne verifies the owner and performs all reads under the caller's RLS context.
7. Refresh tokens maintain connectivity without manually replacing short-lived session tokens.

Completing this flow requires enabling Supabase OAuth Server capabilities and configuring the Ariadne authorization/consent UI. Until that is done, the deployed endpoint should be treated as an MCP foundation rather than a completed ChatGPT app connection.

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

## ChatGPT connection

Once OAuth is completed and the relevant ChatGPT custom-app capability is available for the account/workspace:

1. Enable ChatGPT Developer Mode / custom apps according to OpenAI's current product instructions.
2. Create an Ariadne custom app.
3. Set the remote MCP URL to the deployed `ariadne-mcp` function endpoint.
4. Configure or complete the OAuth authorization flow against Ariadne's Supabase Auth server.
5. Scan/discover tools.
6. Verify that ChatGPT can call `get_workspace_state` and the individual read tools.

The goal is for ChatGPT to retrieve Ariadne state directly whenever the Ariadne app is selected or invoked.

## Security invariants

- GitHub Pages remains static.
- No Supabase service-role key is used by this MCP function.
- The bearer token is verified against Ariadne's existing owner helper before MCP handling.
- Reads continue through Supabase RLS under the caller's JWT.
- Table access is hard-coded to the Ariadne domains intentionally exposed by this function.
- `user_id` is removed from MCP results where it is only an internal ownership key.
- Browser origins are denied unless local or explicitly configured.
- V1 is read-only. Any future mutation tool must represent an existing bounded Ariadne operation and validate its input.
