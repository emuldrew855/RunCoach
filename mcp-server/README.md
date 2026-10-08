# RunCoach Strava MCP server

A standalone, read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) service for connecting ChatGPT to a runner's Strava activities. ChatGPT supplies the conversation and coaching reasoning; this service handles authorization and retrieves data.

It does **not** require RunCoach's React frontend, backend process, agent service, or an OpenAI API key. In the recommended integration mode, it shares RunCoach's PostgreSQL credential rows, but has its own OAuth schema and deployment.

## How it piggybacks on RunCoach

Reuse the **approved Strava application registration**: `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are the same credentials used by RunCoach. Users authorize that Strava application, not a newly registered Strava application.

The standalone service follows the integration already present in:

- `../backend/src/config/strava.ts`: authorization, token, and API base URLs.
- `../backend/src/services/stravaService.ts`: authorization-code exchange, access-token refresh, and authenticated activity requests.
- `../backend/src/services/activityService.ts`: running activity filtering.

These files are architectural references, **not runtime imports**. Importing the backend's services would also pull in its user models, database configuration, and application setup. This service instead implements a small, independent Strava adapter.

**Reusing the registration is not reusing a RunCoach browser login session.** Each MCP connection goes through Strava authorization; existing RunCoach users do not need a separate MCP username or password.

Strava refresh tokens rotate for an application/athlete pair. Maintaining unrelated token copies under the same registration could disconnect the existing app. The shared credential bridge therefore uses RunCoach's `public.users` row as the source of truth and serializes refreshes with a PostgreSQL row lock. Matching changes to the existing backend coordinate both refreshes and login token exchanges; its callback URL and normal login behavior stay unchanged. Deploy these backend changes before using the MCP service alongside it.

### Two permissions, one connection flow

```text
ChatGPT
  │  OAuth authorization request + PKCE challenge
  ▼
MCP /oauth/authorize
  │  Validates ChatGPT client, callback, scope, and resource
  │  Creates expiring state tied to the browser
  ▼
Strava /oauth/authorize
  │  Runner signs in and grants the approved Strava app read access
  ▼
MCP /strava/callback
  │  Validates state; exchanges Strava code server-side
  │  Displays explicit consent to share running data with ChatGPT
  ▼
MCP /oauth/consent
  │  Returns a separate, single-use MCP authorization code to ChatGPT
  ▼
ChatGPT → MCP /oauth/token
  │  Client authentication + PKCE verification
  │  Returns MCP access/refresh tokens, never Strava tokens
  ▼
ChatGPT → MCP /mcp → Strava API → compact running data → ChatGPT
```

Strava OAuth authorizes the service to read Strava data. The outer MCP OAuth flow authorizes ChatGPT to use that runner's connection. Neither authorization grants write access.

The Strava request retains RunCoach's existing `read,activity:read_all,profile:read_all` scopes so replacing shared credentials does not remove the existing app's access to private activities or profile data. Missing/deselected permissions are rejected before exchanging the code. MCP tools still expose only running metrics, not athlete profiles. Successful Strava authorization updates the shared credentials **even if the runner subsequently denies ChatGPT consent**; denial creates no MCP grant.

## Tool-to-Strava mapping

MCP tools are JSON-RPC calls to the **single `/mcp` transport endpoint**, not separate REST endpoints. For example, `tools/call` with `name: "get_recent_runs"` dispatches through the Strava adapter:

| MCP tool | Strava request | Returned information |
| --- | --- | --- |
| `get_recent_runs` | `GET https://www.strava.com/api/v3/athlete/activities` | A bounded page of runs, with date, distance, duration, pace, elevation, and available heart-rate/cadence metrics |
| `get_run_details` | `GET https://www.strava.com/api/v3/activities/{activity_id}` | One owned run plus a bounded page of metric splits |
| `get_weekly_summary` | Bounded, paginated `GET https://www.strava.com/api/v3/athlete/activities` | Weekly run counts, distance, duration, and elevation totals |

Tool input schemas:

| Tool | Parameters and defaults |
| --- | --- |
| `get_recent_runs` | `days`: 1–90, default 30; `page`: 1–100, default 1; `per_page`: 1–50, default 20 |
| `get_run_details` | `activity_id`: positive safe integer, required; `split_offset`: 0–10,000, default 0; `split_limit`: 1–100, default 100 |
| `get_weekly_summary` | `weeks`: 1–12, default 4 |

For example, after MCP initialization, the client sends:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_recent_runs",
    "arguments": { "days": 14, "page": 1, "per_page": 20 }
  }
}
```

The service validates the arguments, resolves the authenticated connection's athlete, and calls Strava's `/athlete/activities` endpoint with a Unix `after` timestamp and the bounded page arguments. MCP results contain both machine-readable `structuredContent` and a JSON text representation. `tools/list` exposes the input schemas to ChatGPT.

Before making these requests, the adapter locks the shared credential row and checks the stored Strava token's expiry. If needed, it calls `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token`, stores the rotated credentials in that same transaction, and then makes the read request. This reuses the existing app's Strava integration without invoking its activity-sync or AI pipelines.

Identity always comes from the authorized MCP connection. Tools never accept a user or athlete ID. Detail requests verify that the returned activity belongs to the connected athlete.

### Limits and data semantics

- Runs include `Run`, `TrailRun`, and `VirtualRun`.
- Tool input schemas reject unsupported parameters and enforce finite bounds.
- Recent-run pagination applies to Strava's **all-activity** pages before filtering runs; a page may contain fewer runs or none. Follow pagination metadata rather than assuming a short list means there are no more runs.
- Weekly totals use Monday-start **UTC** weeks, not RunCoach's local calendar preferences. The current week is partial.
- Weekly retrieval has a fixed page budget. Results explicitly identify incomplete/truncated retrieval rather than presenting partial totals as complete.
- Distances/elevation are meters, durations are seconds, heart rate is beats per minute, and pace is explicitly labeled.
- Raw speed metrics are meters per second. Cadence retains Strava's reported value; do not assume it has been doubled into running steps per minute.
- Fetch timestamps describe live API retrieval, not RunCoach's activity-sync watermark.
- Missing heart rate or splits are normal. They are not fabricated.
- Outputs exclude Strava credentials, GPS coordinates/polylines, locations, athlete profiles, and unrelated private data.
- Activity titles are untrusted user content, not instructions to ChatGPT.
- No tools sync the RunCoach database, modify training plans, or create/edit Strava activities.

## Setup

### 1. Prerequisites

- A supported Node.js runtime matching `package.json`.
- PostgreSQL and a database role permitted to create/use the dedicated MCP schema.
- The existing Strava application's client credentials and approval covering this ChatGPT data-sharing use case.
- A publicly reachable HTTPS origin for the MCP service.
- A ChatGPT account/workspace that supports custom remote MCP apps and OAuth. Workspace administrators may need to enable developer mode.

Platform availability changes. Check the current [OpenAI developer-mode documentation](https://developers.openai.com/api/docs/guides/developer-mode) and [Strava API agreement](https://www.strava.com/legal/api) before deployment. This implementation does not obtain vendor approval.

### 2. Configure the service

From the repository root:

```bash
cd mcp-server
npm ci
cp .env.example .env
```

Configure the environment using `.env.example`:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection to the existing RunCoach database for the shared credential bridge |
| `MCP_PUBLIC_URL` | Fixed external service origin, e.g. `https://mcp.example.com`; not derived from request headers |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Existing approved Strava app credentials |
| `STRAVA_REDIRECT_URI` | This service's callback: `https://mcp.example.com/strava/callback` |
| `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET` | Separate, preregistered ChatGPT OAuth client credentials; not Strava credentials |
| `MCP_REDIRECT_URIS` | Exact, comma-separated OAuth callbacks supplied by the ChatGPT client; no wildcards |

Generate a separate OAuth client secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store credentials in the environment or a secret manager, never source control. The MCP client secret must be independent of the Strava client secret and RunCoach's JWT/service secrets.

`MCP_ALLOWED_ORIGINS` lists permitted browser origins for MCP/CORS requests; the service's own origin is also permitted. `PORT` controls the listener: the example uses `3002`, which may already be occupied by RunCoach's agent service. Choose a different port if both are running on the same host.

### 3. Configure Strava's callback

Keep the existing RunCoach callback unchanged. This service uses its own `/strava/callback`, not RunCoach's `/api/v1/auth/callback`.

Strava enforces its configured **Authorization Callback Domain**. If the existing registration does not permit the new service hostname, host this service behind the same approved hostname or resolve callback-domain configuration with Strava before deployment. Do not change the domain in a way that breaks the existing application's login.

Only use HTTP with loopback hosts during local development. Remote ChatGPT needs a reachable HTTPS deployment, not an inaccessible localhost URL.

### 4. Create the schema and start

```bash
npm run migrate
npm start
```

`schema.sql` is the idempotent database definition. It is separate from `../backend/migrations/` and does not change the structure of RunCoach's `users` or `activities` tables. The shared bridge reads/writes only identity and Strava credential fields in `public.users`; it does not read profiles, conversations, or activities from RunCoach. RunCoach's schema must already exist. Migrations must run before accepting connections.

The MCP schema stores connection identity, short-lived authorization state, grants, and hashed MCP tokens. Strava credentials remain exclusively in RunCoach's existing `users` table and retain that application's storage format: these are legacy plaintext fields, not newly encrypted records. Activities are retrieved on demand rather than copied from RunCoach's training database.

The schema relationship is:

```text
public.users (existing)
  strava_id ──────────────► runcoach_mcp.connections.athlete_id
  access_token                      │
  refresh_token                     └─► runcoach_mcp.grants.athlete_id
  token_expires_at                            │
                                             └─► runcoach_mcp.tokens.grant_id

runcoach_mcp.authorization_requests
  expiring browser-bound OAuth state and pending consent
```

Identity links use Strava's athlete ID; the existing RunCoach user ID is not exposed to ChatGPT. See `schema.sql` for the database schema and `schema/tools.json` for JSON Schema input/output contracts and Strava endpoint mappings.

### 5. Connect ChatGPT

1. Enable developer mode/custom apps in the supported ChatGPT account or workspace.
2. Add a remote MCP app pointing to `https://mcp.example.com/mcp`.
3. Select OAuth and configure the service's `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET`. These are **not** the Strava client credentials.
4. Obtain the exact OAuth callback URI used by ChatGPT and register it in `MCP_REDIRECT_URIS` before connecting.
5. Connect, sign in at Strava, and approve the read-only data-sharing consent page.
6. Ask ChatGPT to review recent runs or retrieve an individual run.

This pilot uses a **preregistered confidential OAuth client**, not open dynamic client registration. Use a client capable of sending the configured credentials and an S256 PKCE challenge.

## HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Nonsecret health response |
| `GET /.well-known/oauth-authorization-server` | OAuth issuer/endpoints, scopes, PKCE, and supported client authentication |
| `GET /.well-known/oauth-protected-resource/mcp` | MCP resource and authorization-server discovery |
| `GET /.well-known/oauth-protected-resource` | Discovery alias |
| `GET /oauth/authorize` | Start ChatGPT's authorization and redirect to Strava |
| `GET /strava/callback` | Validate Strava callback and display MCP consent |
| `POST /oauth/consent` | Explicit, browser-bound allow/deny decision |
| `POST /oauth/token` | Exchange code or rotate refresh token |
| `POST /oauth/revoke` | Authenticated revocation of MCP access |
| `GET /connections`, `POST /connections` | Browser-session connection status and disconnect |
| `/mcp` | Authenticated MCP Streamable HTTP transport |

The protected resource is `MCP_PUBLIC_URL` plus `/mcp`, with the scope `runcoach:read`. An unauthenticated MCP request receives a `401` discovery challenge; a RunCoach JWT or Strava bearer token is not a substitute for an MCP access token.

## Security and operations

- MCP bearer tokens and authorization codes are stored as hashes. Protect RunCoach's shared Strava credential rows with database access controls and encrypted storage/backups; they are legacy plaintext fields.
- Browser-bound, expiring state protects Strava login; explicit consent is CSRF-protected.
- MCP codes are short-lived, single-use, and bound to the client, exact callback, resource, and S256 PKCE challenge.
- Refresh tokens rotate; grant revocation invalidates all associated MCP tokens, including previously issued access tokens.
- Revoking this MCP connection does **not** call Strava's app-wide deauthorization endpoint, which could also disconnect RunCoach.
- Data already shared with ChatGPT is not deleted by revoking access.
- Do not log authorization headers, callback query strings, cookies, token responses, encryption keys, or upstream error bodies. Apply the same redaction at the reverse proxy.
- Keep PostgreSQL backups and access controls protected. The service needs its MCP schema plus access to the existing `public.users` identity/credential columns; it does not need RunCoach's other data tables.
- Strava API limits are shared with the existing app registration. A summary can require multiple upstream requests. Upstream throttling and bounded retrieval must be surfaced to the client.
- This is a lightweight pilot, not a multi-region service. Process-local rate limiting requires a shared limiter before horizontally scaling; do not trust arbitrary forwarded IP headers.
- Token refresh is coordinated through the shared `public.users` row lock in both services. Authorization-code exchanges lock the users table before calling Strava because the athlete identity is not yet known; this temporarily serializes logins and blocks credential writes/refreshes across athletes. This is a small-pilot tradeoff, not a high-throughput authentication design. Do not run an older backend token implementation or an independent token store against the same Strava app/athlete pair.
- `/connections` manages the grant approved in that browser for 30 minutes. After that session expires, revoke the connection from the OAuth client using `/oauth/revoke`; it is not a persistent RunCoach account-management page.
- Serve consent pages and MCP over HTTPS. The current production configuration expects TLS termination at a **loopback reverse proxy**, which must preserve the configured public `Host` and strip/replace forwarded headers. A remote/container proxy requires a deliberate trusted-proxy change before deployment; do not trust arbitrary forwarded headers.

## Validation

```bash
npm test
```

Tests use synthetic users and mocked Strava responses; they do not need real Strava credentials or send athlete data to Strava. The PostgreSQL integration suite is skipped unless `MCP_TEST_DATABASE_URL` points to a dedicated database whose name ends in `_test`:

```bash
MCP_TEST_DATABASE_URL=postgresql://localhost:5432/runcoach_mcp_test npm test
npm run check
```

**Do not use your application database for tests.** Integration tests create/truncate test `public.users` and MCP tables. Create an empty disposable database first; `npm test` without the variable runs the non-database tests only. The production `DATABASE_URL` remains the existing RunCoach database.

Before launching with real users, test the complete deployed ChatGPT → consent → Strava → MCP flow, denial, reconnect/revocation, upstream rate limits, missing splits, and two-account isolation. Automated protocol tests do not substitute for testing the actual ChatGPT client and Strava callback-domain configuration.
