# RunCoach Production Deployment

## Status and prerequisites

This is a provisioning and deployment runbook, not a record of a live deployment. No Azure resources can be provisioned or production smoke tests completed until the owner supplies the Azure subscription/tenant, approved region and budget, appropriate Azure access, and Strava/OpenAI credentials.

Before proceeding:

- Choose an Azure region supporting Linux App Service and PostgreSQL Flexible Server, and confirm SKU availability and quotas (including B1 if selected). PostgreSQL SKU name and tier must match.
- Approve costs using the current Azure pricing calculator for that region: one shared App Service plan, PostgreSQL compute/storage/backups, networking/egress, optional monitoring, and OpenAI usage. Defaults are starting points, not a capacity, price, uptime, or high-availability guarantee.
- Install Azure CLI with Bicep support and use Node.js 22 for local builds.
- Have subscription resource-creation access plus permission to create resource-group role assignments (for example, Owner, or Contributor plus Role Based Access Control Administrator). The later GitHub deployment identity only needs resource-group Contributor.
- Configure repository branch protection and the GitHub **Prod** environment as described in [GITHUB_SECRETS.md](GITHUB_SECRETS.md).

## Architecture and runtime

`infra/main.bicep` is a subscription-scope entry point. It creates the resource group and invokes `infra/resources.bicep` to create:

| Component | Production configuration |
| --- | --- |
| Backend | Linux Node.js 22 App Service; startup `npm start`; built `dist/`, `scripts/migrate.js`/`scripts/migrationRunner.js`, SQL migrations, and production dependencies |
| Agent | Separate Linux Node.js 22 App Service; startup `npm start`; production dependencies and built `dist/` |
| Frontend | Separate Linux Node.js 22 App Service; ZIP contains `dist/` and `server.mjs`; startup `node server.mjs` |
| Hosting | All three apps share one Linux App Service plan; default B1, capacity one |
| Database | PostgreSQL Flexible Server 16; default Burstable `Standard_B1ms`, 32 GB storage |
| Network | Private PostgreSQL delegated subnet and linked private DNS; backend and agent integrate with a separate App Service delegated subnet |
| Deployment identity | User-assigned managed identity, GitHub OIDC federation, Contributor scoped to this resource group |

The frontend uses the native Node static SPA server, not a development server or an additional static-hosting product. Client-side routes such as `/dashboard` fall back to `dist/index.html`; generated assets are served from `dist/`. App Service supplies the listening port (configured as 8080). ZIP packages are built in CI, with Azure-side build disabled.

All App Services enforce HTTPS, minimum TLS 1.2 for app/SCM endpoints, Always On, and disabled FTP. These settings do not remove the need for authentication or app monitoring. Backend and agent HTTP endpoints remain public; VNet integration provides outbound access to the private database, not private inbound app access.

PostgreSQL public network access is disabled, with secure transport required. The template constructs a shared `DATABASE_URL` with URL-encoded username/password and `sslmode=verify-full` for CA and hostname verification. Never disable certificate validation to troubleshoot a connection.

The template allowlists `VECTOR,UUID-OSSP` using PostgreSQL's `azure.extensions` setting. SQL migrations create the `vector` and `"uuid-ossp"` extensions inside the database; allowlisting alone does not create them. Check region/server extension support and database-user extension permissions before migration.

Backups default to seven days (configurable from 7–35 days); geo-redundant backup and high availability are disabled in this baseline. Agree on recovery objectives before approving production use.

Storage autogrow is disabled for the default Burstable tier and enabled for the other supported tiers. Monitor free storage and plan manual capacity increases for Burstable; do not assume the default 32 GB expands automatically.

## 1. Bootstrap infrastructure securely

Infrastructure provisioning is a separate owner/operator step, not performed by the code-deployment workflow. Do not give the CI identity subscription-wide permissions just to bootstrap its own resource group.

1. Sign in with the approved provisioning identity and select the subscription:

   ```bash
   az login
   az account set --subscription "<subscription-id>"
   REPO_ROOT="/home/runner/work/RunCoach/RunCoach"
   ```

   `REPO_ROOT` must be the absolute root of your checkout; replace the shown runner path when operating from another machine.

2. Create an access-restricted JSON parameter file **outside the checkout**, using a trusted local editor or secret-management process. For example, use `$HOME/.config/runcoach/prod.parameters.json`, with directory permissions 700 and file permissions 600. The following is a **placeholder template**, not usable credentials:

   ```json
   {
     "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
     "contentVersion": "1.0.0.0",
     "parameters": {
       "location": { "value": "<approved-azure-region>" },
       "resourceGroupName": { "value": "runcoach-prod" },
       "namePrefix": { "value": "runcoach" },
       "appServiceSku": { "value": "B1" },
       "postgresSkuName": { "value": "Standard_B1ms" },
       "postgresSkuTier": { "value": "Burstable" },
       "postgresStorageSizeGB": { "value": 32 },
       "postgresBackupRetentionDays": { "value": 7 },
       "postgresAdministratorLogin": { "value": "runcoachadmin" },
       "postgresAdministratorPassword": { "value": "<strong-database-password>" },
       "openaiApiKey": { "value": "<openai-api-key>" },
       "stravaClientId": { "value": "<strava-client-id>" },
       "stravaClientSecret": { "value": "<strava-client-secret>" },
       "jwtSecret": { "value": "<random-secret-at-least-32-characters>" },
       "serviceSecret": { "value": "<different-random-secret-at-least-32-characters>" },
       "openaiModel": { "value": "gpt-4o" },
       "agentMiniModel": { "value": "gpt-4o-mini" },
       "githubRepository": { "value": "emuldrew855/RunCoach" }
     }
   }
   ```

   The password, OpenAI key, Strava client secret, JWT secret, and service secret are Bicep `@secure()` inputs. The database password must meet Azure administrator-password complexity requirements and be 8–128 characters; JWT and service secrets must each be at least 32 characters. Keep real values out of Git, shell history, CLI literals, logs, screenshots, and workflow artifacts. Do not generate the real file with a shell command containing credentials. Use an approved secure mechanism to retain or delete the file after provisioning; restricted permissions do not replace encrypted secret storage.

3. Review and create the subscription deployment:

   ```bash
   az deployment sub what-if \
     --name runcoach-prod-bootstrap \
     --location "<approved-azure-region>" \
     --template-file "$REPO_ROOT/infra/main.bicep" \
     --parameters @"$HOME/.config/runcoach/prod.parameters.json"

   az deployment sub create \
     --name runcoach-prod-bootstrap \
     --location "<approved-azure-region>" \
     --template-file "$REPO_ROOT/infra/main.bicep" \
     --parameters @"$HOME/.config/runcoach/prod.parameters.json" \
     --query properties.outputs
   ```

   Review output in a trusted terminal; never publish secret-bearing app-setting queries. What-if is not proof that resource providers, quotas, permissions, or runtime connectivity will succeed.

4. Use the non-secret deployment outputs to populate the 11 GitHub **Prod environment secrets** in [GITHUB_SECRETS.md](GITHUB_SECRETS.md). Outputs include `backendAppName`, `agentAppName`, `frontendAppName`, `backendUrl`, `agentUrl`, `frontendUrl`, `githubClientId`, `githubTenantId`, and `githubSubscriptionId`.
5. Set the Strava app's authorization callback domain to the backend hostname (no scheme/path). The backend uses the configured `stravaRedirectUri` output (`<backendUrl>/api/v1/auth/callback`), exchanges the code, then redirects to the frontend `/callback` route. Confirm the complete login flow before launch.

Resource creation does not deploy the application ZIPs. Initial app health may fail until the code is deployed and migrations finish. Re-running infrastructure can overwrite manually changed app settings; retain the intended configuration in the secure provisioning source.

## 2. Runtime secrets and application settings

Bicep configures Azure App Service settings; CI does not read application credentials from GitHub or embed them in frontend bundles.

| App | Settings |
| --- | --- |
| Backend | `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `FRONTEND_URL`, `AGENT_SERVICE_URL`, `SERVICE_SECRET` |
| Agent | `NODE_ENV=production`, `DATABASE_URL`, `OPENAI_API_KEY`, `DEFAULT_MODEL`, `MINI_MODEL`, `BACKEND_API_URL`, `SERVICE_SECRET`, `BACKEND_SERVICE_TOKEN`, `DAILY_TOKEN_LIMIT`, `USE_SUPERVISOR_ARCHITECTURE` |
| Frontend | Runtime port and deployment settings only; public `VITE_API_URL` and `VITE_STRAVA_CLIENT_ID` are supplied at build time |

The backend/agent `SERVICE_SECRET` and agent `BACKEND_SERVICE_TOKEN` must match. `BACKEND_API_URL` is the backend origin, without `/api/v1`; `AGENT_SERVICE_URL` is the agent origin. `FRONTEND_URL` controls the backend's expected frontend origin. Do not use localhost URLs in production.

Azure app settings are secrets accessible to authorized resource operators; restrict RBAC, audit access, and rotate database/API/JWT/service credentials through the secure provisioning process. Coordinate shared-secret rotation across both apps; JWT rotation invalidates existing tokens. No client secret, database URL, JWT secret, service token, or OpenAI key belongs in any `VITE_*` variable.

## 3. Database initialization and existing deployments

Backend startup runs migrations before listening; `cd "$REPO_ROOT/backend" && npm run migrate` uses the same shared runner when working from a checkout. Run manual database maintenance from an approved host with VNet/private-DNS connectivity and securely supplied `DATABASE_URL`. Public GitHub-hosted runners and ordinary developer laptops cannot directly reach this private database; do not open a public firewall to work around that.

- **Fresh database:** startup creates `public.schema_migrations` and applies SQL files in filename order. Each migration and its filename/SHA-256 record commit atomically.
- **Tracked database:** only pending migrations run. Changed/missing applied files and gaps before recorded history cause failure. Do not edit previously applied SQL files.
- **Untracked, nonempty application schema (`public`):** startup and CLI deliberately refuse to proceed. Extension-owned objects and unrelated schemas are not application migration history. There is no automatic replay or blanket “ignore errors” switch.
- A shared PostgreSQL advisory lock `(1381322307, 1)` serializes the startup and CLI runners. Failure rolls back the current migration and prevents the backend from becoming ready; previously committed migrations remain recorded.

For an existing untracked installation, stop both backend and agent writers, take a verified restorable backup, and rehearse on a restored copy. Audit schema **and data** against the exact release's migrations, establish the contiguous prefix already applied, and reconcile any partial or out-of-order changes. The historical runner swallowed failures: the newest migration's apparent effects do not prove earlier migrations succeeded. An operator must explicitly baseline `public.schema_migrations` with each verified filename and the SHA-256 checksum of its exact UTF-8 SQL bytes, in a transaction while holding the same advisory lock (a transaction-scoped `pg_advisory_xact_lock(1381322307, 1)` also conflicts with the runner's session lock). Commit the audited records and release the lock before resuming normal migration. Do not fabricate completion records for unapplied work or mark every file applied solely because tables exist. There is no built-in baseline environment variable or CLI flag; an audited manual baseline is distinct from `npm run migrate`, which then applies only later files.

Migration `021_enable_pgvector.sql` converts JSONB embeddings, drops/renames columns, and builds vector indexes. It is a data/schema transition, not a safe historical replay. Existing data needs dimension/content validation, backup and downtime planning; empty databases still need extension support and sufficient resources to build indexes. Application rollback alone cannot undo this migration. Preserve and test a compatible database restore path before upgrading.

Migration 016 now creates checkpoint tables only if absent rather than dropping existing tables; existing checkpoint data and compatible saver-added columns are preserved. Verify the deployed agent's checkpoint schema compatibility during an upgrade.

The migration lock does not serialize all application background jobs. Keep the shared plan at one instance initially: backend/agent in-process cron jobs may run once per instance and can also overlap during restarts/deployments. Always On is not durable scheduling. Add distributed job ownership/durable scheduling before scale-out or stronger scheduling guarantees.

## 4. Deploy code

`.github/workflows/deploy-production.yml` permits only `main`/`master`. Manual dispatch remains available; automatic pushes affecting full-stack code or infrastructure require the repository variable `ENABLE_FULL_STACK_DEPLOYMENT=true`. Leave this variable unset when launching only MCP, including when earlier full-stack changes are in the same pull request. Protect those branches with required reviews/checks. Restrict **Prod** deployment branches to `main`/`master`, require deployment approvals where supported, and run manual deployments only from a reviewed trusted branch/ref. The environment-based OIDC subject does not itself enforce branch trust.

The workflow uses Node.js 22, validates all required configuration before deployment, builds deployable ZIPs, and authenticates with `azure/login@v2` using OIDC. Federation is:

```text
issuer:   https://token.actions.githubusercontent.com
audience: api://AzureADTokenExchange
subject:  repo:emuldrew855/RunCoach:environment:Prod
```

Backend deployment and readiness/migrations precede agent/frontend deployment; final checks cover backend and agent `/health`, frontend root, and SPA deep-link fallback. These checks are necessary but do not prove OAuth, AI responses, database durability, or recovery. Production deployments are serialized; deployment approval/configuration must be completed before releasing jobs.

## 5. Live verification checklist

Complete this checklist against the actual provisioned resources; do not report live success from local builds alone.

- [ ] All three Node 22 CI builds and ZIP deployments succeed; Azure runtime/startup commands match the table above.
- [ ] Backend and agent `GET /health` return 200; startup logs confirm migrations and database/checkpoint setup without exposing secrets.
- [ ] Frontend root and a direct `/dashboard` refresh serve the SPA; built JS/CSS load successfully with correct HTTPS API URLs.
- [ ] Strava OAuth login returns to the frontend; authenticated activity sync succeeds and persists activities.
- [ ] Chat streams a real response through backend and agent; service authentication, OpenAI access, and conversation/checkpoint persistence work.
- [ ] App restarts retain profiles, plans, conversations, and checkpoints; no essential state relies on ephemeral ZIP/local files.
- [ ] PostgreSQL extension presence, TLS validation, private DNS resolution, and backend/agent database connectivity are confirmed.
- [ ] Backup retention and recovery objectives are approved; restore to an isolated server/database is tested, including private-network access and application compatibility.
- [ ] Alerts/log access and current cost budgets are configured; real-load measurements justify the shared plan/database sizing.

For failures, inspect App Service startup/deployment logs and migration errors first. OIDC errors usually mean mismatched issuer/audience/subject or RBAC propagation; database failures require checking private DNS, VNet integration, TLS, extension permissions, and history. Do not bypass migration safety, weaken TLS, print credentials, or broaden CI privileges to make health checks green.
