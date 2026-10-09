# RunCoach Strava MCP server

A standalone, read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) service for connecting ChatGPT to a runner's Strava activities. ChatGPT supplies the conversation and coaching reasoning; this service handles authorization and retrieves data.

It does **not** require RunCoach's React frontend, backend process, agent service, existing database, or an OpenAI API key. The recommended **standalone Azure deployment** uses a dedicated PostgreSQL database and encrypted Strava credentials. ChatGPT supplies the AI; this service makes no OpenAI API calls.

## Choose a credential-storage mode

`STRAVA_CREDENTIAL_STORE=standalone|shared` selects the mode. The default remains `shared` for backward compatibility; explicitly set `standalone` for the independent Azure deployment.

| Mode | Database and credentials | Strava registration |
| --- | --- | --- |
| `standalone` (recommended for Azure) | Dedicated PostgreSQL database, MCP schema only; application-encrypted Strava credentials; no `public.users` dependency | A **different** Strava application registration with approval for this use case, or an explicit cutover where the old app stops using the registration |
| `shared` (legacy compatibility) | Existing RunCoach database and legacy plaintext credential fields in `public.users`, plus MCP schema | Existing approved registration, but only with coordinated locking in **every** token-writing consumer |

**Separate databases do not isolate Strava refresh-token rotation.** Strava rotates tokens for an application/athlete pair. Standalone must not run alongside RunCoach using the same registration and independent token stores. Prefer a new registration; otherwise stop the old application's login, sync, refresh, and other token consumers before cutover. Users must authorize again; **do not copy existing tokens** into the new database.

**Launch precondition:** if old RunCoach continues operating, standalone must use a distinct Strava registration approved for this use case. After credentials have been stored, changing the registration is also a deliberate cutover/reconnection operation, not simply editing `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET`: existing refresh tokens belong to the previous client. Stop affected token consumers, handle the previous credentials/grants through an administrator-controlled process, and require fresh authorization under the new registration before resuming.

The independent adapter follows patterns already present in:

- `../backend/src/config/strava.ts`: authorization, token, and API base URLs.
- `../backend/src/services/stravaService.ts`: authorization-code exchange, access-token refresh, and authenticated activity requests.
- `../backend/src/services/activityService.ts`: running activity filtering.

These files are architectural references, **not runtime imports**. Importing the backend's services would also pull in its user models, database configuration, and application setup. This service instead implements a small, independent Strava adapter.

Each MCP connection goes through Strava authorization; no RunCoach browser session, username, or password is required.

**Shared mode only:** RunCoach's `public.users` row remains the credential source of truth. Both services must serialize refreshes with its PostgreSQL row lock and coordinate authorization-code exchanges before calling Strava. Deploy the matching backend locking changes before concurrent use; its callback and normal login behavior remain unchanged. An older/uncoordinated backend is not safe. Standalone needs neither those backend changes nor access to `public.users`.

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

The Strava request uses `read,activity:read_all,profile:read_all` scopes; retaining these in shared mode prevents removing the existing app's access. Missing/deselected permissions are rejected before exchanging the code. MCP tools expose running and cross-training metrics, not athlete profiles. Successful Strava authorization updates the selected credential store **even if the runner subsequently denies ChatGPT consent**; denial creates no MCP grant.

## Tool-to-Strava mapping

MCP tools are JSON-RPC calls to the **single `/mcp` transport endpoint**, not separate REST endpoints. For example, `tools/call` with `name: "get_recent_runs"` dispatches through the Strava adapter:

| MCP tool | Strava request | Returned information |
| --- | --- | --- |
| `get_recent_runs` | `GET https://www.strava.com/api/v3/athlete/activities` | A bounded page of runs, with date, distance, duration, pace, elevation, and available heart-rate/cadence metrics |
| `get_run_details` | `GET https://www.strava.com/api/v3/activities/{activity_id}` | One owned run plus a bounded page of metric splits |
| `get_weekly_summary` | Bounded, paginated `GET https://www.strava.com/api/v3/athlete/activities` | Weekly run counts, distance, duration, and elevation totals |
| `get_training_summary` | Bounded, paginated activity listing | Exact-date running totals, active days, frequency, weighted pace, weekly breakdown and five longest runs |
| `compare_training_periods` | Two bounded activity listings | Baseline/comparison summaries, signed deltas and duration-normalized weekly rates |
| `get_activity_streams` | Owned run details, then `GET https://www.strava.com/api/v3/activities/{activity_id}/streams` | Aligned, sampled time, distance, speed, heart-rate, cadence and altitude; no GPS |
| `get_recent_activities` | Paginated activity listing | Safe metrics for all sports, including cycling, swimming and strength training |

Tool input schemas:

| Tool | Parameters and defaults |
| --- | --- |
| `get_recent_runs` | `days`: 1–365, default 30; `page`: 1–100, default 1; `per_page`: 1–50, default 20 |
| `get_run_details` | `activity_id`: positive safe integer, required; `split_offset`: 0–10,000, default 0; `split_limit`: 1–100, default 100 |
| `get_weekly_summary` | `weeks`: 1–52, default 4 |
| `get_training_summary` | Required `start_date`, `end_date`: real `YYYY-MM-DD` UTC dates, inclusive, ordered, no later than today; at most 365 calendar days |
| `compare_training_periods` | Required `baseline` and `comparison`, each containing `start_date` and `end_date` under the same summary constraints |
| `get_activity_streams` | Required positive safe-integer `activity_id`; `max_points`: 2–1,000, default 200 |
| `get_recent_activities` | Same `days`, `page`, `per_page` bounds and defaults as `get_recent_runs` |

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

Before making these requests, the adapter locks credentials in the selected store and checks token expiry. If needed, it calls `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token` and persists rotated credentials transactionally before the read request. Standalone encrypts those credentials in its own database; shared mode updates `public.users`. Neither invokes RunCoach's activity-sync or AI pipelines.

Identity always comes from the authorized MCP connection. Tools never accept a user or athlete ID. Detail requests verify that the returned activity belongs to the connected athlete.

### Limits and data semantics

- Runs include `Run`, `TrailRun`, and `VirtualRun`.
- Tool input schemas reject unsupported parameters and enforce finite bounds.
- Historical reviews can request up to 365 days of runs or 52 weekly buckets without changing the short-window defaults. For a six-month review, request 28 weeks to cover the partial current week and calendar-month boundary; use a sufficiently wide `days` window and filter the returned run dates to the precise calendar interval when needed. Weekly boundary buckets can include days outside that interval. The connector reads accessible Strava history directly, not just RunCoach's locally synced activities.
- Prefer `get_training_summary` for exact calendar dates: include both boundary days, exclude records outside them, and clip today's end to fetch time. Boundary weekly buckets contain only runs in the requested period and mark `calendar_week_incomplete`. Weekly rates use the inclusive calendar-day count (today counts as a day, even though it is incomplete).
- Each summary fetches at most 10 pages of 100 **all-sport** activities; comparisons fetch at most 20 pages total. `partial`/`truncated` mean that this budget was exhausted, even if few runs were found. Empty weeks are retained, duplicate activity IDs are counted once, and coverage means accessible Strava data, not proof that every workout was recorded.
- Summary totals sum available distance/time/elevation only. Check `metric_coverage` before treating totals as complete. Weighted pace uses only runs with positive paired distance and moving time. No heart-rate zones or missing sensor values are invented.
- Comparison deltas are comparison minus baseline; a negative pace delta means faster descriptive pace. Percentage change is null for a zero baseline. Deltas are withheld for truncated retrieval or incomplete corresponding metrics; these comparisons do not establish improved fitness or injury risk.
- Streams first verify ownership and running sport, then request only six allowlisted non-GPS series. Available series must align to time and contain valid numbers. `missing_streams` identifies absent sensors; `upstream_reduced` flags upstream downsampling when indicated by Strava. More than 200,000 source points is rejected.
- Stream output uniformly selects common source indices, including the first and last points, without interpolation; `sampled`, `source_points` and `returned_points` describe this reduction. It is not a complete interval trace and may miss peaks. Use metric splits for exact split-level review.
- All-sport listings retain speeds in meters/second; running pace is only added for running sports. No running-only pace assumptions are applied to rides or swims.
- Recent-run pagination applies to Strava's **all-activity** pages before filtering runs; a page may contain fewer runs or none. Follow pagination metadata rather than assuming a short list means there are no more runs.
- Keep `days` and `per_page` unchanged when following `next_page`. Increasing the history window does not increase the per-call page size or the weekly summary's 1,000-activity budget.
- If `has_more` is true but `next_page` is null, the 100-page cap was reached, not the end of history. Narrow the date window; `get_recent_activities` also reports this as `truncated`.
- Weekly totals use Monday-start **UTC** weeks, not RunCoach's local calendar preferences. The current week is partial.
- Weekly retrieval has a fixed page budget. Results explicitly identify incomplete/truncated retrieval rather than presenting partial totals as complete.
- Distances/elevation are meters, durations are seconds, heart rate is beats per minute, and pace is explicitly labeled.
- Raw speed metrics are meters per second. Cadence retains Strava's reported value; do not assume it has been doubled into running steps per minute.
- Fetch timestamps describe live API retrieval, not RunCoach's activity-sync watermark.
- Missing heart rate or splits are normal. They are not fabricated.
- Outputs exclude Strava credentials, GPS coordinates/polylines, locations, athlete profiles, and unrelated private data.
- Activity titles are untrusted user content, not instructions to ChatGPT.
- No tools sync the RunCoach database, modify training plans, or create/edit Strava activities.

After deploying tool changes, **Refresh** the RunCoach connection's metadata in
ChatGPT Settings > Apps (or Plugins), confirm all seven tools are listed, and
start a new conversation. These additions use the existing Strava permissions;
they do not require reconnecting Strava.

Example exact-date arguments:

```json
{"start_date":"2026-04-01","end_date":"2026-09-30"}
```

Example comparison arguments:

```json
{"baseline":{"start_date":"2026-08-01","end_date":"2026-08-31"},"comparison":{"start_date":"2026-09-01","end_date":"2026-09-30"}}
```

## Setup

### 1. Prerequisites

- A supported Node.js runtime matching `package.json`.
- PostgreSQL and a role permitted to create/use the MCP schema; standalone uses an independent database and requires no RunCoach tables.
- A suitable Strava application's credentials and vendor approval covering this ChatGPT data-sharing use case. A new registration may have athlete limits or require additional approval.
- A publicly reachable HTTPS origin for the MCP service.
- A ChatGPT account/workspace that supports custom remote MCP apps and OAuth. Workspace administrators may need to enable developer mode.

Platform availability changes. Check the current [OpenAI custom MCP documentation](https://developers.openai.com/api/docs/guides/custom-mcp-server) and [Strava API agreement](https://www.strava.com/legal/api) before deployment. This implementation does not obtain vendor approval.

On ChatGPT web, open [Plugins](https://chatgpt.com/plugins), select the plus button,
then **Add custom MCP server**, and use the public `/mcp` URL with **OAuth** and
the preregistered MCP client ID/secret (not the Strava client credentials).
Copy the exact production redirect URI from the MCP server's management page
into `MCP_REDIRECT_URIS`. This server advertises RFC 9207 issuer
identification and includes its exact issuer in successful and denied
authorization responses. ChatGPT supports the stable
`https://chatgpt.com/connector_platform_oauth_redirect` callback for such servers;
otherwise use the exact callback-specific URI shown by its management page.
Do not substitute a wildcard or invent a callback ID; follow the current
[OpenAI authentication guide](https://developers.openai.com/plugins/build/auth).

### 2. Configure the service

Use an absolute repository root:

```bash
export REPO_ROOT=/home/runner/work/RunCoach/RunCoach
cd "$REPO_ROOT/mcp-server"
npm ci
cp .env.example .env
```

Configure the environment using `.env.example`:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated PostgreSQL database in standalone; existing RunCoach database only in shared mode. Azure requires TLS with `sslmode=verify-full` |
| `STRAVA_CREDENTIAL_STORE` | `standalone` or `shared`; defaults to `shared` |
| `MCP_CREDENTIAL_ENCRYPTION_KEY` | Required in standalone: canonical base64 encoding of exactly 32 random bytes |
| `MCP_PUBLIC_URL` | Fixed external service origin, e.g. `https://mcp.example.com`; not derived from request headers |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Approved Strava registration for the selected mode; standalone must use a separate registration or explicit cutover |
| `STRAVA_REDIRECT_URI` | Direct `/strava/callback`, or the fixed backend relay route described below |
| `STRAVA_CALLBACK_RELAY_ORIGIN` | Optional shared-mode-only, exact HTTPS backend origin; no path, credentials, query or fragment |
| `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET` | Separate, preregistered ChatGPT OAuth client credentials; not Strava credentials |
| `MCP_REDIRECT_URIS` | Exact, comma-separated OAuth callbacks supplied by the ChatGPT client; no wildcards |
| `HOST`, `PORT` | Bind address and listener port; Azure binds `0.0.0.0` |
| `TRUSTED_PROXY_MODE` | `loopback` by default; `azure-app-service` only behind trusted Azure managed ingress, or `cidrs` with explicit `TRUSTED_PROXY_CIDRS` |

Generate a separate OAuth client secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store credentials in the environment or a secret manager, never source control. The MCP client secret must be independent of the Strava client secret and RunCoach's JWT/service secrets.

Generate the standalone encryption key in a protected provisioning environment with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and store it securely, together with protected backups. **Never replace or regenerate this key on redeployment: losing/changing it makes existing encrypted credentials undecryptable.** Startup and migration decrypt existing standalone records and fail closed for a wrong key or corruption. There is no automated key rotation: stop all replicas, back up the database and old key, administratively decrypt/re-encrypt records, and update every replica together before restarting. Do not paste keys into command arguments, logs, GitHub variables, or tracked files.

`MCP_ALLOWED_ORIGINS` lists permitted browser origins for MCP/CORS requests; the service's own origin is also permitted. `PORT` controls the listener: the example uses `3002`, which may already be occupied by RunCoach's agent service. Choose a different port if both are running on the same host.

Browser responses use `Referrer-Policy: strict-origin`: referrers contain only the
origin, never OAuth paths or queries, while same-origin consent and disconnect
forms retain their valid `Origin` header. Do not replace this with `no-referrer`
or allow `Origin: null`; the former makes browser form origins opaque and the
latter weakens origin validation.

The consent routes' CSP `form-action` permits this server and only the origins of
configured `MCP_REDIRECT_URIS`, because browsers also enforce it on the redirect
after form submission. OAuth separately requires an exact registered callback
URI; this does not enable arbitrary redirects. Other routes retain
`form-action 'self'`. A self-only consent policy blocks the successful ChatGPT
redirect after consuming consent, making a repeated click fail.

### 3. Configure Strava's callback

This service uses `/strava/callback`, not RunCoach's `/api/v1/auth/callback`. Configure the standalone registration for the MCP hostname. In shared mode, keep the existing RunCoach callback unchanged.

Strava enforces its configured **Authorization Callback Domain**. For shared mode, the backend can relay the MCP browser callback without changing that domain or its normal login callback. Configure backend `MCP_CALLBACK_ORIGIN` to the exact MCP HTTPS origin, MCP `STRAVA_CALLBACK_RELAY_ORIGIN` to the exact backend HTTPS origin, and MCP `STRAVA_REDIRECT_URI` to `${STRAVA_CALLBACK_RELAY_ORIGIN}/api/v1/auth/strava/mcp/callback`. The relay forwards only bounded OAuth fields to the fixed MCP `/strava/callback`; it does not exchange or store tokens. The MCP server still verifies its browser cookie and one-use state. Deploy the backend's coordinated authorization/refresh transactions before enabling shared MCP OAuth.

`validate-mcp.yml` compiles and tests the backend changes and produces a four-module `backend-shared-strava` artifact. This is a narrow compatibility update, not a full backend release: retain the deployed database/startup modules, dependencies, migrations, and existing settings. The backend redacts the relay query from its Morgan application access logs; platform or external proxy logging must likewise avoid capturing OAuth credentials.

If the backend uses `WEBSITE_RUN_FROM_PACKAGE=1`, update its active deployment ZIP,
not just files exposed through Kudu's `site/wwwroot` filesystem. Preserve every
unrelated archive entry and replace only the reviewed compiled modules. Verify the
active package after deployment and confirm the running callback route; a successful
upload alone does not prove the process has loaded the new package. Arrange any
required backend restart with the service owner.

Only use HTTP with loopback hosts during local development. Remote ChatGPT needs a reachable HTTPS deployment, not an inaccessible localhost URL.

### 4. Create the schema and start

```bash
cd "$REPO_ROOT/mcp-server"
npm run migrate
npm start
```

`schema.sql` is the idempotent MCP database definition, separate from `../backend/migrations/`. Migrations must run before accepting connections. Standalone creates its own credential storage and requires no existing RunCoach schema. Shared mode additionally requires existing `public.users`, reads/writes only its identity/Strava credential fields, and does not change the structure of RunCoach's users or activities tables.

For historical MCP-schema upgrades, migration preserves the legacy `connections.credentials` column and its values, conditionally removing only its `NOT NULL` constraint so new connections can be inserted. It neither imports nor encrypts historical plaintext JSONB values; protect that legacy data separately. The new standalone deployment uses a fresh dedicated database, avoiding historical data and never copying legacy tokens.

The MCP schema stores connection identity, short-lived authorization state, grants, and hashed MCP tokens. Standalone stores application-encrypted Strava credentials there. **Only shared mode** retains legacy plaintext credentials in `public.users`. Activities are retrieved live rather than copied from the old database.

The shared-mode identity relationship is:

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

In standalone, `runcoach_mcp.credentials` replaces the `public.users` side of this relationship; grants and tokens remain MCP-owned. Each athlete's Strava token payload is encrypted with AES-256-GCM and athlete-bound authenticated data. There is no automatic token import.

Standalone migration is transactional and shares an advisory lock with token operations, with a five-second lock timeout. A registration-wide advisory lock serializes upstream token calls, including calls for different athletes; refresh also locks the athlete's credential row.

### 5. Connect ChatGPT

1. Enable developer mode/custom apps in the supported ChatGPT account or workspace.
2. Add a remote MCP app pointing to `https://mcp.example.com/mcp`.
3. Select OAuth and configure the service's `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET`. These are **not** the Strava client credentials.
4. Obtain the exact OAuth callback URI used by ChatGPT and register it in `MCP_REDIRECT_URIS` before connecting.
5. Connect, sign in at Strava, and approve the read-only data-sharing consent page.
6. Ask ChatGPT to review recent runs or retrieve an individual run.

This pilot uses a **preregistered confidential OAuth client with S256 PKCE**, not unrestricted public-client access or open dynamic client registration. Confirm the actual ChatGPT client supports the configured client authentication. Deployment does not confer Strava vendor approval or public ChatGPT app-directory approval.

## Independent Azure deployment

The independent infrastructure entry point is `infra/mcp.bicep`, at **resource-group scope**. Use the existing `runcoach-prod-rg` in **SwedenCentral**, but provision a **new dedicated App Service plan, MCP web app, PostgreSQL server/database, and private database VNet networking**. Do not reuse or update the old plan, web app, database, agent, or their configuration. The MCP service has no OpenAI dependency.

Implemented component boundaries:

- **Storage:** mode selection, encrypted standalone credentials, idempotent MCP migrations, and transactional token-rotation coordination; preserve shared compatibility without requiring `public.users` in standalone.
- **Runtime:** independent Node service/startup, production configuration, fixed external HTTPS origin, and trusted Azure managed-ingress handling. Reject invalid standalone keys/configuration before serving requests.
- **Infrastructure/deployment:** isolated resources in `infra/mcp.bicep`; a separate `.github/workflows/deploy-mcp.yml` targeting the **`ProdMcp`** GitHub environment, not the old application's production workflow/environment.

The full-stack workflow's automatic deployment requires `main`/`master`, a matching push path (`backend/**`, `frontend/**`, `agent-service/**`, `infra/main.bicep`, or `infra/resources.bicep`), and the repository-level opt-in `vars.ENABLE_FULL_STACK_DEPLOYMENT == 'true'`. Its own workflow path is not a push trigger. **Leave `ENABLE_FULL_STACK_DEPLOYMENT` unset for the MCP-only launch**: the initial PR may also contain earlier full-stack changes, so path filtering alone is insufficient protection. The old workflow retains manual dispatch; keep its `Prod` approval protections in place. The MCP template uses explicit new resource names and must not touch old apps.

### Administrator bootstrap

#### Infrastructure-first provisioning (no OAuth configuration)

When the ChatGPT callback or Strava registration is not ready, deploy
`infra/mcp-bootstrap.bicep` instead. It shares `infra/mcp-resources.bicep` with
the complete template and creates the same isolated infrastructure, but no
application settings or application package. The empty web app is **not a
working MCP endpoint**. Both compute tiers begin billing immediately.

Supply `githubRepository`, `entraAdministratorObjectId`, and
`entraAdministratorName` (the provisioning user's Entra object ID and exact
UPN). This path enables Entra-only PostgreSQL authentication and assigns the
web app a system-assigned managed identity; no database password is created.
The GitHub deployment identity remains separate from the runtime identity.
Review an Incremental what-if before applying.

Before deploying application code, connect to PostgreSQL from inside the
private VNet as the Entra administrator and create a non-admin application role:

```sql
-- Replace both placeholders with the verified deployment outputs.
SELECT * FROM pgaadauth_create_principal_with_oid(
  '<mcpAppServiceName>', '<runtimePrincipalId>', 'service', false, false);
GRANT CONNECT ON DATABASE runcoach_mcp TO "<mcpAppServiceName>";
-- Reconnect to runcoach_mcp as the administrator.
CREATE SCHEMA IF NOT EXISTS runcoach_mcp AUTHORIZATION "<mcpAppServiceName>";
```

The role owns only the MCP schema, allowing the existing startup migrations.
Do not grant it server administrator, CREATEDB, or CREATEROLE privileges.
Creating the Azure identity alone does not create its PostgreSQL role.
Do not open public database access to perform this step.

#### Reusing an existing Strava registration and database

Use `infra/mcp-shared-runtime.bicep` to configure the **existing dedicated MCP
web app only**. It does not redeploy PostgreSQL, change its authentication
settings, or modify the backend. Supply a current in-memory snapshot of MCP
app settings as `existingAppSettings`; this secure parameter preserves unrelated
settings. Supply the existing backend origin and shared PostgreSQL host/database.
Never pass secrets as command-line arguments or write parameter files containing them.
Preserve password authentication on the existing backend database while enabling
Entra authentication for MCP; do not migrate the backend's identity implicitly.

As the PostgreSQL Entra administrator, run `infra/mcp-shared-access.sql` with
psql variables `runtime_role` (MCP app name), `runtime_object_id` (system-assigned
principal ID), and `database_name` (existing RunCoach database). Connect with
an in-memory Entra token and verified TLS. The script verifies the principal
mapping and refuses to take over an existing MCP schema with another owner.
The runtime owns only `runcoach_mcp`, has sequence usage, and can read identity
and token columns, insert token connections, and update token/expiry fields.
It cannot read email/profile columns or modify them.

Column-level UPDATE permissions cannot acquire PostgreSQL's EXCLUSIVE table
lock. The administrator-owned `public.runcoach_mcp_lock_credentials()` function
provides only that fixed lock, with a fixed `pg_catalog` search path and no PUBLIC
execution grant. Shared managed-identity startup verifies execution permission
and uses it inside the existing five-second-timeout transaction, preserving
coordination with backend row/table locks without granting table-wide UPDATE.
The SQL script must remain administrator-run; runtime migrations do not create
or own this privileged function.

For `ProdMcp`, set `STRAVA_CREDENTIAL_STORE=shared`, `MCP_POSTGRES_HOST`,
`MCP_POSTGRES_DATABASE`, and `STRAVA_CALLBACK_RELAY_ORIGIN` as environment
variables. Deployment verifies these against persistent Azure settings,
requires managed-identity database authentication in shared mode, and does
not require a standalone encryption key. Deploy the validated narrow backend
package and configure its relay **before** accepting MCP OAuth connections.

Finish configuration with `infra/mcp.bicep`, retaining the same resource names
and provisioned PostgreSQL SKU, and setting `databaseAuthMode=entra` and the same Entra administrator values.
Omit `postgresPassword` for this mode. Supply the real OAuth configuration and
a securely backed-up persistent encryption key. This sets
`DATABASE_AUTH_MODE=managed-identity` and a passwordless `DATABASE_URL` with
`sslmode=verify-full`. Runtime and CLI migrations acquire a fresh Entra token
for each new database connection using the app's system-assigned identity.
The legacy password mode remains available for existing environments; a
password is required by PostgreSQL when using that mode. Use Entra mode for
new production deployments. Never switch an Entra server back to password
mode by accidentally applying the legacy defaults.

An authorized administrator with infrastructure provisioning and role-assignment permissions (Owner/RBAC administrator as appropriate) provisions infrastructure first. Keep secure ARM parameters (database password, Strava/client secrets, encryption key, and any secret-bearing connection string) in a protected parameter file **outside the repository**, supplied through a secret manager or protected deployment runner. Never inline them in commands, commit them, or print them in logs. Reuse the encryption key for every deployment.

Supply these template parameters:

| Parameter | Value |
| --- | --- |
| `location` | `swedencentral` (default) |
| `mcpAppName`, `mcpPlanName`, `mcpVnetName`, `postgresServerName` | Dedicated names; defaults are MCP-specific. Verify no collision with existing resources |
| `postgresAdministrator` | Dedicated database login; default `mcpadmin` |
| `databaseAuthMode` | Set `entra` for new production deployments; default `password` is legacy compatibility |
| `entraAdministratorObjectId`, `entraAdministratorName` | Same verified administrator object ID and exact UPN used for infrastructure-first provisioning |
| `postgresSkuName` | `Standard_B1ms` by default; `Standard_B2s` is a higher-cost capacity fallback. Retain the provisioned SKU in subsequent deployments |
| `postgresPassword` | Omit in Entra mode; legacy password mode requires a secure new password, at least 16 characters |
| `stravaClientId`, `stravaClientSecret` | Separate approved registration, or completed registration cutover; secret is secure |
| `mcpClientId`, `mcpClientSecret` | Preregistered confidential ChatGPT client; secure secret is at least 32 characters |
| `mcpCredentialEncryptionKey` | Secure, persistent canonical base64 32-byte encryption key (44 characters) |
| `redirectUris` | Array of exact ChatGPT OAuth callbacks |
| `githubRepository` | Exact GitHub `owner/repository` for the `ProdMcp` federated subject |

Have the administrator create the protected external parameter file using this complete ARM parameter-file structure, replacing **every placeholder** through secure provisioning. This example contains no real secrets; do not save the populated file in the repository. Optional region/resource-name parameters are omitted to inherit the SwedenCentral/MCP-specific defaults.

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "databaseAuthMode": { "value": "entra" },
    "entraAdministratorObjectId": { "value": "<verified-administrator-object-id>" },
    "entraAdministratorName": { "value": "<exact-administrator-UPN>" },
    "postgresSkuName": { "value": "<same-SKU-as-infrastructure-bootstrap>" },
    "stravaClientId": { "value": "<dedicated-strava-client-id>" },
    "stravaClientSecret": { "value": "<strava-client-secret>" },
    "mcpClientId": { "value": "<preregistered-chatgpt-client-id>" },
    "mcpClientSecret": { "value": "<independent-client-secret-at-least-32-characters>" },
    "mcpCredentialEncryptionKey": { "value": "<persistent-canonical-base64-of-32-random-bytes>" },
    "redirectUris": { "value": ["https://<exact-chatgpt-callback-host>/<exact-callback-path>"] },
    "githubRepository": { "value": "<owner>/<repository>" }
  }
}
```

```bash
export REPO_ROOT=/home/runner/work/RunCoach/RunCoach
export MCP_PARAMETERS_FILE=/secure/protected/runcoach-mcp.parameters.json
az account set --subscription 0e290e4a-2096-4873-9155-c354d72be589
az deployment group what-if \
  --resource-group runcoach-prod-rg \
  --name runcoach-mcp-bootstrap \
  --template-file "$REPO_ROOT/infra/mcp.bicep" \
  --parameters "@$MCP_PARAMETERS_FILE" \
  --mode Incremental
```

`MCP_PARAMETERS_FILE` is a placeholder for an administrator-provided, absolute, protected path; these instructions do not create that file. Confirm the active account belongs to tenant `f666f1b4-2ea5-4626-a863-4b6a8fc48770`. Inspect what-if before applying: only dedicated MCP resources may be created/changed, with **no changes or deletions to old RunCoach resources**. Incremental mode alone is not an isolation guarantee; unique resource names and review are essential. Never deploy this template in Complete mode.

After approving that exact parameter set:

```bash
az deployment group create \
  --resource-group runcoach-prod-rg \
  --name runcoach-mcp-bootstrap \
  --template-file "$REPO_ROOT/infra/mcp.bicep" \
  --parameters "@$MCP_PARAMETERS_FILE" \
  --mode Incremental \
  --output none
```

### Separate deployment identity

Configure GitHub OIDC for `ProdMcp`, with the exact federated subject `repo:<owner>/<repository>:environment:ProdMcp`. Protect the environment with required approvals and deployment-branch restrictions permitting only `main`/`master`; the workflow also restricts deployment to these branches. Give its identity **Website Contributor scoped only to the new MCP web app** and **Reader scoped to `runcoach-prod-rg`**. Reader permits discovery, not modification; the identity must not receive resource-group Contributor/Owner or rights to alter the old app. An authorized resource-group Owner (or equivalent provisioning plus RBAC permissions) performs bootstrap and privileged role assignments, not this app-only identity.

The template creates a dedicated user-assigned deployment identity and federated credential. Populate the **`ProdMcp` environment**, using the nonsecret deployment outputs:

| Environment entry | Source |
| --- | --- |
| Secret `AZURE_MCP_CLIENT_ID` | Output `azureClientId` (deployment identity, not OAuth client ID) |
| Secret `AZURE_TENANT_ID` | Output `azureTenantId` |
| Secret `AZURE_SUBSCRIPTION_ID` | Output `azureSubscriptionId` |
| Secret `AZURE_MCP_APP_NAME` | Output `mcpAppServiceName` |
| Secret `MCP_PUBLIC_URL` | Output `mcpPublicUrl` |
| Variable `STRAVA_CLIENT_ID` | Same dedicated registration ID passed to bootstrap |
| Variable `MCP_CLIENT_ID` | Same confidential ChatGPT client ID passed to bootstrap |
| Variable `MCP_POSTGRES_HOST` | Output `postgresHost`, the dedicated MCP PostgreSQL hostname |

These Azure identifiers/URLs are not passwords; their storage as environment secrets matches the workflow interface. Application secrets remain provisioned app settings, not ZIP contents or workflow output. Register output `stravaCallbackUrl` with the selected Strava application. Before deploying, the workflow validates the app/public origin, exact Strava callback, persistent encryption key, and database URL against the dedicated `MCP_POSTGRES_HOST`, `runcoach_mcp` database, and `sslmode=verify-full`. Settings are inspected in memory without writing credential files or printing secrets.

The template persists secure bootstrap values in Azure App Service's encrypted app settings; it does **not** provision Key Vault or Key Vault references. Keep the source encryption key and other secrets in a protected secret manager/Key Vault out of band for recovery and redeployment. The template sets `PORT=8080`, overriding the local default `3002`.

The separate workflow must deploy only the `mcp-server` artifact and preserve provisioned app settings/secrets. `npm start` runs migrations within the VNet-integrated App Service before listening, using its private database connectivity; migrations do **not** run on the GitHub runner. Do not open the database firewall to migrate from a public runner. Set `STRAVA_CREDENTIAL_STORE=standalone`, the stable encryption key, the dedicated database URL, `HOST=0.0.0.0`, and `TRUSTED_PROXY_MODE=azure-app-service`. Enable HTTPS Only and verify health after deployment. Configure environment approval/protection rules before enabling production deployments.

### Cost and capacity

The dedicated **App Service B1 plan and PostgreSQL server incur ongoing charges
while provisioned**, plus storage/networking costs. PostgreSQL defaults to B1ms;
B2s is a higher-cost capacity fallback. A regional capacity failure can occur
even when Azure advertises a SKU. Retain the SKU that actually provisioned in
every subsequent deployment. "On-demand" means retrieving Strava data when tools
are called, **not scale-to-zero hosting**. Check current regional pricing and
subscription capacity before bootstrap.

### Build preparation without production access

The reusable `.github/workflows/validate-mcp.yml` installs dependencies on a
GitHub runner, runs all four disposable PostgreSQL test fixtures, and produces
an MCP-only ZIP. Pull requests run validation without Azure credentials,
OIDC write permission, or the `ProdMcp` environment. Production deploys consume
that validated artifact instead of rebuilding it.

If local dependency installation is unavailable, push the feature branch and
dispatch the existing deployment workflow in prepare-only mode:

```bash
gh workflow run deploy-mcp.yml --ref <feature-branch> \
  -f prepareOnly=true -f refreshLockfile=true
```

Prepare-only runs do not access Azure or deploy, even when dispatched on
`main`/`master`. An explicitly requested lockfile refresh returns a
`mcp-lockfile` artifact for review; download and commit it before merging.
The `mcp-deploy` artifact is emitted only after validation and packaging succeed.
Normal PR and production runs use `npm ci` without refreshing the lockfile.

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

- MCP bearer tokens and authorization codes are stored as hashes. Standalone Strava credentials are application-encrypted with `MCP_CREDENTIAL_ENCRYPTION_KEY`; also protect database storage/backups and require TLS. Shared-mode Strava fields remain legacy plaintext and require appropriate database access controls.
- Browser-bound, expiring state protects Strava login; explicit consent is CSRF-protected.
- MCP codes are short-lived, single-use, and bound to the client, exact callback, resource, and S256 PKCE challenge.
- Refresh tokens rotate; grant revocation invalidates all associated MCP tokens, including previously issued access tokens.
- Revoking this MCP connection does **not** call Strava's app-wide deauthorization endpoint, which could also disconnect RunCoach.
- Data already shared with ChatGPT is not deleted by revoking access.
- Standalone cleanup expires OAuth requests/tokens/grants/connections only. Denied, revoked, and orphan encrypted credential rows are retained **indefinitely until deliberate operator purge**; no automatic credential pruning is implemented, because it could race with in-flight authorization. MCP grant/token revocation immediately removes MCP access but neither erases upstream credentials nor revokes the Strava application's authorization; users can separately revoke the app in Strava.
- To purge standalone credentials, stop **all MCP replicas and token workers**, confirm no live grants or pending authorization flows depend on the intended rows, delete only those standalone credential rows, and then resume. Subsequent access requires fresh authorization. Never delete shared-mode `public.users` tokens as part of an MCP retention purge.
- Do not log authorization headers, callback query strings, cookies, token responses, encryption keys, or upstream error bodies. Apply the same redaction at the reverse proxy.
- Keep PostgreSQL backups and access controls protected. Standalone needs only its own database/schema. Shared mode additionally needs `public.users` identity/credential columns, not RunCoach's other data tables.
- Strava API limits apply per registration (shared with RunCoach only in shared mode). Summaries can require multiple requests; surface upstream throttling and bounded retrieval to the client.
- This is a lightweight pilot, not a multi-region service. Process-local rate limiting requires a shared limiter before horizontally scaling; do not trust arbitrary forwarded IP headers.
- Shared mode coordinates refresh through `public.users` row locks in both services. Authorization-code exchanges lock the users table before calling Strava because athlete identity is not yet known; this temporarily serializes logins and blocks credential writes across athletes. Standalone coordinates its own store instead. These are small-pilot tradeoffs; never run independent token stores against the same registration/athlete pair.
- `/connections` manages the grant approved in that browser for 30 minutes. After that session expires, revoke the connection from the OAuth client using `/oauth/revoke`; it is not a persistent RunCoach account-management page.
- Serve consent pages and MCP over HTTPS. Default `TRUSTED_PROXY_MODE=loopback` requires a loopback proxy preserving the public `Host` and replacing forwarded headers. Azure uses `HOST=0.0.0.0`, `TRUSTED_PROXY_MODE=azure-app-service`, HTTPS Only, and exactly one trusted managed ingress hop. Do not expose the backend directly or use Azure mode on another host; arbitrary forwarded headers are untrusted. For other ingress, use deliberately scoped `cidrs`/`TRUSTED_PROXY_CIDRS`.
- Production requires the actual `Host` to match `MCP_PUBLIC_URL` and forwarded protocol to be exactly `https`, not a comma-separated protocol list. `/health` supports `GET` and `HEAD` but does not bypass these checks; configure health probes accordingly.
- The workflow checks `/health` over the configured public HTTPS origin. The template does not enable App Service's internal health-check path because its Host/forwarded-protocol compatibility has not been verified; do not weaken runtime validation to accommodate an unverified probe.

## Validation

```bash
cd "$REPO_ROOT/mcp-server"
npm test
```

Tests use synthetic users and mocked Strava responses; they do not need real Strava credentials or send athlete data to Strava. Database suites are opt-in: `MCP_TEST_DATABASE_URL` enables shared OAuth/HTTP integration, `MCP_STORAGE_TEST_DATABASE_URL` enables storage integration, `MCP_STANDALONE_TEST_DATABASE_URL` enables the standalone HTTP/OAuth pipeline without `public.users`, and `MCP_STARTUP_TEST_DATABASE_URL` enables packaged-artifact startup verification. Give each a **separate empty disposable database** whose name ends in `_test`, because their destructive setup must not collide:

```bash
cd "$REPO_ROOT/mcp-server"
MCP_TEST_DATABASE_URL=postgresql://localhost:5432/runcoach_mcp_oauth_test \
MCP_STORAGE_TEST_DATABASE_URL=postgresql://localhost:5432/runcoach_mcp_storage_test \
MCP_STANDALONE_TEST_DATABASE_URL=postgresql://localhost:5432/runcoach_mcp_standalone_test \
MCP_STARTUP_TEST_DATABASE_URL="${MCP_STARTUP_TEST_DATABASE_URL:?Set a self-contained disposable startup-test URL first}" \
npm test
npm run check
```

Replace these examples with your disposable local database connections. Before running the command, securely populate `MCP_STARTUP_TEST_DATABASE_URL` in your environment with a self-contained connection to the fourth disposable database, `runcoach_mcp_startup_test`. The startup suite's child process intentionally omits inherited `PG*` settings, so its URL must include the disposable login/password when required; it cannot rely on `PGUSER`/`PGPASSWORD` alone. Use synthetic test credentials only, without committing or printing the populated URL.

**Never use either production database for tests.** Integration tests create/truncate synthetic tables, including test `public.users` for shared compatibility; the standalone pipeline resets only its disposable MCP schema. Use separate empty disposable databases ending in `_test`; local `npm test` without these variables skips all four database suites. Never point destructive tests at the Azure MCP database or the old RunCoach database.

The MCP workflow automatically starts a health-checked disposable PostgreSQL 16 service, creates four distinct synthetic `_test` databases, sets all four variables, and runs `npm test -- --test-concurrency=1` for shared OAuth, storage, standalone HTTP/OAuth, and packaged-artifact startup integration. Its database tests do not use Azure PostgreSQL or real Strava credentials and need no additional GitHub secrets/variables.

Trace configuration through the selected storage/proxy modes during validation: use synthetic credentials and mocked upstream responses, verify the fixed public origin and actual Host checks, and reject spoofed forwarded headers/protocol lists. These checks do not establish live Azure ingress or ChatGPT compatibility.

### Live verification checklist

Actual ChatGPT/Strava end-to-end verification **cannot be performed without credentials, a reachable deployment, and live account access**. Automated tests are not evidence that this checklist passed:

Azure authentication/bootstrap and public-endpoint live checks remain operator tasks; implemented infrastructure and deployment instructions do not mean they have been executed.

1. Confirm Strava vendor approval, the dedicated registration (or completed cutover), exact callback domain, confidential ChatGPT client credentials, and registered callback URI.
2. Verify public HTTPS `/health`, both discovery documents, and unauthenticated `/mcp` returning `401` with discovery; confirm issuer/resource URLs use the configured HTTPS origin.
3. Connect the real ChatGPT client: authorize Strava, validate the displayed consent, approve it, and complete authenticated PKCE exchange. Confirm ChatGPT never receives Strava tokens.
4. Refresh connection metadata and discover all seven tools. Check recent runs/all-sport activities, owned run details/streams, weekly totals, an exact-date summary and a two-period comparison against Strava. Check UTC boundaries, units, pagination/truncation, missing metrics and a run without splits or sensors.
5. Deny consent in a fresh attempt: no usable MCP grant. Repeat login with expired/altered/replayed state or authorization codes and verify rejection.
6. Exercise refresh/rotation and restart/redeploy with the **same** encryption key; confirm continued access without storing or logging plaintext credentials.
7. Disconnect/revoke; verify old access and refresh tokens fail, then reconnect successfully. Verify revocation does not deauthorize the Strava application.
8. Connect a second athlete; verify no cross-account activity/detail access. Exercise upstream throttling using mocks, not abusive live requests.
9. Confirm database private networking/TLS, forwarded-header handling, redacted logs, and that the old RunCoach app/resources remain unchanged and operational (except an explicitly agreed registration cutover).
