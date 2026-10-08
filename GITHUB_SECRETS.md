# GitHub Production Deployment Configuration

The workflow `.github/workflows/deploy-production.yml` deploys three Azure App Services using Node.js 22 and OIDC. Configure the following **11 secrets in the GitHub environment named exactly `Prod`**, not a long-lived Azure login credential or static-site deployment token.

## Bootstrap order

1. Supply subscription/tenant access, an approved Azure region and budget, and application credentials. Infrastructure is not provisioned automatically by the code-deployment workflow.
2. Follow [DEPLOYMENT.md](DEPLOYMENT.md) to deploy `infra/main.bicep` with an access-restricted parameter file outside the repository.
3. The template creates a user-assigned managed identity, a federated credential, and resource-group-scoped **Contributor**. Copy its non-secret outputs into the environment secrets below.
4. In the repository, open **Settings → Environments → New environment → Prod**, then add each entry under **Environment secrets**.
5. Restrict deployment branches to reviewed `main`/`master` branches, add required reviewers/approvals where supported, and protect those branches with required PR reviews/checks. Manually dispatch only a trusted reviewed branch/ref. The OIDC environment subject alone is not a branch restriction.

## Required Prod environment secrets

| Name | Value/source |
| --- | --- |
| `AZURE_CLIENT_ID` | Bicep output `githubClientId`: client ID of the generated deployment managed identity |
| `AZURE_TENANT_ID` | Bicep output `githubTenantId` |
| `AZURE_SUBSCRIPTION_ID` | Bicep output `githubSubscriptionId` |
| `AZURE_BACKEND_APP_NAME` | Bicep output `backendAppName` |
| `AZURE_AGENT_APP_NAME` | Bicep output `agentAppName` |
| `AZURE_FRONTEND_APP_NAME` | Bicep output `frontendAppName` |
| `BACKEND_URL` | Bicep output `backendUrl`; HTTPS origin, no trailing slash |
| `AGENT_URL` | Bicep output `agentUrl`; HTTPS origin, no trailing slash |
| `FRONTEND_URL` | Bicep output `frontendUrl`; HTTPS origin, no trailing slash |
| `VITE_API_URL` | Exactly `BACKEND_URL` followed by `/api/v1` |
| `VITE_STRAVA_CLIENT_ID` | Public Strava application client ID, matching Bicep input `stravaClientId` |

Example URL shapes (placeholders only):

```text
BACKEND_URL=https://<backend-app-name>.azurewebsites.net
AGENT_URL=https://<agent-app-name>.azurewebsites.net
FRONTEND_URL=https://<frontend-app-name>.azurewebsites.net
VITE_API_URL=https://<backend-app-name>.azurewebsites.net/api/v1
```

The identifiers, hostnames, and Strava client ID are not passwords, but the current workflow reads them from `secrets`. `VITE_API_URL` and `VITE_STRAVA_CLIENT_ID` are public browser-build configuration. Changing these requires rebuilding/redeploying the frontend; Azure runtime settings cannot change an already-built Vite bundle.

## OIDC authentication

`azure/login@v2` requests a short-lived GitHub token using `id-token: write`; no Azure client secret is required. Federation must match exactly:

```text
issuer:   https://token.actions.githubusercontent.com
audience: api://AzureADTokenExchange
subject:  repo:emuldrew855/RunCoach:environment:Prod
```

The template's `githubRepository` defaults to `emuldrew855/RunCoach`. A repository rename/fork or environment-name change requires deliberate updates to federation and configuration. Keep Contributor scoped to the RunCoach resource group; bootstrap role-assignment permissions belong to the provisioning operator, not the deployment identity. Protect workflow and infrastructure changes through code review because trusted environment jobs receive deployment access.

## Infrastructure inputs are separate from GitHub deployment secrets

Supply the following secure Bicep parameters using the external restricted parameter file or an approved secret-management mechanism:

| Secure input | Azure runtime destination |
| --- | --- |
| `postgresAdministratorPassword` | URL-encoded into backend/agent `DATABASE_URL` with TLS `sslmode=verify-full` |
| `jwtSecret` | Backend `JWT_SECRET` |
| `serviceSecret` | Backend/agent `SERVICE_SECRET` and agent `BACKEND_SERVICE_TOKEN` (same value) |
| `stravaClientSecret` | Backend `STRAVA_CLIENT_SECRET` |
| `openaiApiKey` | Backend/agent `OPENAI_API_KEY` |

Non-secret inputs include `location`, `resourceGroupName`, `namePrefix`, approved App Service/PostgreSQL SKUs and backup settings, `postgresAdministratorLogin`, `stravaClientId`, model names, and `githubRepository`. See the complete placeholder parameter file in [DEPLOYMENT.md](DEPLOYMENT.md).

These application credentials reside in Azure backend/agent app settings, not frontend source/build variables and not these 11 GitHub deployment entries. Never put any database credential, Strava client secret, JWT secret, service token, or OpenAI key in a `VITE_*` variable. Do not commit real parameter files, put secrets in CLI arguments/history, print app settings, or attach secret-bearing deployment logs. Restrict Azure RBAC and rotate actual application secrets through the secure provisioning process.

## Verification and troubleshooting

- Confirm all 11 entries exist in **Prod**, environment approvals/branch restrictions are active, and the workflow uses that environment.
- Automatic full-stack deployment also requires the **repository variable** `ENABLE_FULL_STACK_DEPLOYMENT=true`. Leave it unset for MCP-only operation; manual dispatch is still available.
- Allow for Azure RBAC propagation after provisioning. Authentication failures require checking the client/tenant/subscription IDs and exact issuer/audience/subject, not creating a new password credential.
- Authorization failures require verifying resource-group Contributor and target resource scope; missing resources require checking the three generated app names.
- Preflight accepts only `refs/heads/main` or `refs/heads/master` and rejects missing configuration, non-HTTPS origins, trailing slashes, and mismatched `VITE_API_URL`.
- Frontend build-configuration changes require a rebuild. Backend URL changes require a Strava callback-domain/redirect-URI review; frontend/backend/agent origin changes also require corresponding Azure app-setting updates.
- After a trusted deployment, complete the full live smoke/restart/backup checklist in [DEPLOYMENT.md](DEPLOYMENT.md). Builds and HTTP health alone do not verify Strava sync, AI chat, persistence, or recovery.

No live Azure deployment can be verified until the owner provides the required access, region/budget decisions, and credentials.
