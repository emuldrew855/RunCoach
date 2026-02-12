# RunCoach Azure Deployment Plan

## Overview

Deploy the RunCoach application to Azure with a focus on **cost optimization**, **reliability**, and **performance**.

**Estimated Monthly Cost**: ~$30-40 USD
**Target Users**: 100-500 concurrent users
**Uptime Target**: 99.9% (managed services SLA)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Azure Cloud                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────┐                           │
│  │  Azure Static Web Apps          │                           │
│  │  (Frontend - React/Vite)        │                           │
│  │  • Global CDN distribution      │                           │
│  │  • Free SSL certificate         │                           │
│  │  • Custom domain support        │                           │
│  │  Cost: FREE (or $9/month)       │                           │
│  └─────────────────────────────────┘                           │
│              │                                                  │
│              │ HTTPS                                            │
│              ▼                                                  │
│  ┌─────────────────────────────────┐                           │
│  │  Azure App Service (Basic B1)   │                           │
│  │  (Backend - Node.js API)        │                           │
│  │  • 1.75 GB RAM, 1 vCPU          │                           │
│  │  • Auto SSL, custom domain      │                           │
│  │  • Built-in monitoring          │                           │
│  │  • WebJobs for cron             │                           │
│  │  Cost: ~$13/month               │                           │
│  └─────────────────────────────────┘                           │
│              │                                                  │
│              │ PostgreSQL connection                            │
│              ▼                                                  │
│  ┌─────────────────────────────────┐                           │
│  │  Azure Database for PostgreSQL  │                           │
│  │  Flexible Server (Burstable)    │                           │
│  │  • B1ms (1 vCore, 2GB RAM)      │                           │
│  │  • 32 GB storage                │                           │
│  │  • Automated backups (7 days)   │                           │
│  │  Cost: ~$12-15/month            │                           │
│  └─────────────────────────────────┘                           │
│                                                                 │
│  ┌─────────────────────────────────┐                           │
│  │  Application Insights           │                           │
│  │  (Monitoring & Logging)         │                           │
│  │  Cost: FREE (basic tier)        │                           │
│  └─────────────────────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

External Services:
  • Strava API (free)
  • OpenAI API (pay per use, ~$5-20/month depending on usage)
```

---

## Cost Breakdown

| Service | Tier | Monthly Cost | Notes |
|---------|------|--------------|-------|
| **Frontend** | Azure Static Web Apps (Free) | $0 | 100 GB bandwidth/month included |
| **Backend** | App Service Basic B1 | $13 | 1.75 GB RAM, 10 GB storage |
| **Database** | PostgreSQL Flexible B1ms | $12-15 | Burstable, 2 GB RAM, 32 GB storage |
| **Monitoring** | Application Insights (Basic) | $0 | 5 GB data/month free |
| **OpenAI API** | Pay-per-use | $5-20 | Depends on usage (GPT-4o calls) |
| **Storage** | Blob Storage (optional) | $1-2 | For training plan uploads |
| **TOTAL** | | **~$30-50/month** | Scalable as needed |

---

## Phase 1: Prerequisites & Setup (30 minutes)

### 1.1 Azure Account Setup

1. **Create Azure Account**
   - Go to: https://azure.microsoft.com/free
   - Sign up for free account ($200 credit for 30 days)
   - Verify payment method (required but won't charge unless you upgrade)

2. **Install Azure CLI**
   ```bash
   # Windows (using winget)
   winget install Microsoft.AzureCLI

   # Or download from: https://aka.ms/installazurecliwindows
   ```

3. **Login to Azure**
   ```bash
   az login
   az account list --output table
   az account set --subscription "<your-subscription-id>"
   ```

### 1.2 Create Resource Group

```bash
# Set variables
$RESOURCE_GROUP="runcoach-prod"
$LOCATION="eastus"  # or "westeurope", "southeastasia" (choose nearest region)

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION
```

---

## Phase 2: Database Deployment (20 minutes)

### 2.1 Create PostgreSQL Flexible Server

```bash
# Set database variables
$DB_SERVER_NAME="runcoach-db-$(Get-Random -Maximum 9999)"
$DB_ADMIN_USER="runcoach_admin"
$DB_ADMIN_PASSWORD="SecurePass123!$(Get-Random -Maximum 999)"  # Change this!
$DB_NAME="runcoach"

# Create PostgreSQL server
az postgres flexible-server create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --location $LOCATION `
  --admin-user $DB_ADMIN_USER `
  --admin-password $DB_ADMIN_PASSWORD `
  --sku-name Standard_B1ms `
  --tier Burstable `
  --storage-size 32 `
  --version 14 `
  --public-access 0.0.0.0

# Create database
az postgres flexible-server db create `
  --resource-group $RESOURCE_GROUP `
  --server-name $DB_SERVER_NAME `
  --database-name $DB_NAME

# Enable SSL (recommended)
az postgres flexible-server parameter set `
  --resource-group $RESOURCE_GROUP `
  --server-name $DB_SERVER_NAME `
  --name require_secure_transport `
  --value ON

# Save connection string
$DB_CONNECTION_STRING="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com/${DB_NAME}?sslmode=require"

Write-Host "Database Connection String: $DB_CONNECTION_STRING"
# SAVE THIS CONNECTION STRING - you'll need it!
```

### 2.2 Configure Firewall Rules

```bash
# Allow Azure services to access database
az postgres flexible-server firewall-rule create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --rule-name AllowAzureServices `
  --start-ip-address 0.0.0.0 `
  --end-ip-address 0.0.0.0

# Allow your local IP for migrations (find your IP at https://whatismyip.com)
$MY_IP="<your-public-ip>"
az postgres flexible-server firewall-rule create `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --rule-name AllowMyIP `
  --start-ip-address $MY_IP `
  --end-ip-address $MY_IP
```

### 2.3 Run Database Migrations

```bash
# Update local .env with Azure database connection string
# Then run migrations locally
cd backend
$env:DATABASE_URL = "$DB_CONNECTION_STRING"
npm run migrate  # Or: node -r dotenv/config -e "require('./src/config/database').runMigrations()"

# Verify migrations worked
psql "$DB_CONNECTION_STRING" -c "\dt"
```

---

## Phase 3: Backend Deployment (30 minutes)

### 3.1 Create App Service Plan

```bash
$APP_SERVICE_PLAN="runcoach-plan"

az appservice plan create `
  --name $APP_SERVICE_PLAN `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku B1 `
  --is-linux
```

### 3.2 Create Web App

```bash
$BACKEND_APP_NAME="runcoach-api-$(Get-Random -Maximum 9999)"

az webapp create `
  --resource-group $RESOURCE_GROUP `
  --plan $APP_SERVICE_PLAN `
  --name $BACKEND_APP_NAME `
  --runtime "NODE:18-lts" `
  --deployment-local-git

# Enable HTTPS only
az webapp update `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --https-only true

# Set always on (keeps app warm)
az webapp config set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --always-on true
```

### 3.3 Configure Environment Variables

```bash
# Generate a secure JWT secret
$JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

# Set all environment variables
az webapp config appsettings set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --settings `
    NODE_ENV=production `
    PORT=8080 `
    DATABASE_URL="$DB_CONNECTION_STRING" `
    JWT_SECRET="$JWT_SECRET" `
    JWT_EXPIRES_IN=7d `
    STRAVA_CLIENT_ID="<your-strava-client-id>" `
    STRAVA_CLIENT_SECRET="<your-strava-client-secret>" `
    STRAVA_REDIRECT_URI="https://${BACKEND_APP_NAME}.azurewebsites.net/api/v1/auth/callback" `
    OPENAI_API_KEY="<your-openai-api-key>" `
    OPENAI_MODEL="gpt-4o" `
    OPENAI_MAX_TOKENS=1000 `
    FRONTEND_URL="https://<your-static-web-app>.azurestaticapps.net"
```

### 3.4 Deploy Backend Code

**Option A: Deploy from Local Git**

```bash
# Get Git credentials
az webapp deployment list-publishing-credentials `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME

# Add Azure remote
cd backend
git init
git add .
git commit -m "Initial backend deployment"
git remote add azure "https://${BACKEND_APP_NAME}.scm.azurewebsites.net/${BACKEND_APP_NAME}.git"

# Push to Azure
git push azure main
```

**Option B: Deploy from GitHub Actions (Recommended)**

Create `.github/workflows/deploy-backend.yml`:

```yaml
name: Deploy Backend to Azure

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        working-directory: ./backend
        run: npm ci

      - name: Build
        working-directory: ./backend
        run: npm run build

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ secrets.AZURE_BACKEND_APP_NAME }}
          publish-profile: ${{ secrets.AZURE_BACKEND_PUBLISH_PROFILE }}
          package: ./backend
```

### 3.5 Configure App Service for Node.js

Create `backend/web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="dist/index.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="DynamicContent">
          <match url="/*" />
          <action type="Rewrite" url="dist/index.js"/>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="node_modules" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

Update `backend/package.json` with startup script:

```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "postinstall": "npm run build"
  }
}
```

### 3.6 Set Up Cron Job for Weekly Analysis

**Option A: Azure App Service WebJob**

Create `backend/webjob-cron/run.js`:

```javascript
// WeJob script to run Monday analysis
const https = require('https');

const API_URL = process.env.BACKEND_URL || 'https://runcoach-api.azurewebsites.net';

https.get(`${API_URL}/api/v1/analysis/trigger-all`, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
}).on('error', (e) => {
  console.error(e);
  process.exit(1);
});
```

Create `backend/webjob-cron/settings.job`:

```json
{
  "schedule": "0 0 6 * * 1"
}
```

Upload as ZIP to Azure Portal > App Service > WebJobs.

**Option B: Azure Functions (Timer Trigger) - Recommended**

Create separate Azure Function:

```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Create function app
func init WeeklyAnalysisFunction --typescript
cd WeeklyAnalysisFunction
func new --name WeeklyAnalysis --template "Timer trigger"
```

Update `WeeklyAnalysis/function.json`:

```json
{
  "bindings": [
    {
      "name": "myTimer",
      "type": "timerTrigger",
      "direction": "in",
      "schedule": "0 0 6 * * 1"
    }
  ]
}
```

Update `WeeklyAnalysis/index.ts`:

```typescript
import { AzureFunction, Context } from "@azure/functions";
import axios from "axios";

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
    const API_URL = process.env.BACKEND_URL;

    try {
        const response = await axios.post(`${API_URL}/api/v1/analysis/trigger-all`);
        context.log('Weekly analysis triggered successfully:', response.data);
    } catch (error) {
        context.log.error('Failed to trigger weekly analysis:', error);
    }
};

export default timerTrigger;
```

Deploy function:

```bash
func azure functionapp publish runcoach-functions
```

---

## Phase 4: Frontend Deployment (20 minutes)

### 4.1 Create Static Web App

```bash
$STATIC_APP_NAME="runcoach-web"

az staticwebapp create `
  --name $STATIC_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Free `
  --source https://github.com/<your-username>/runcoach `
  --branch main `
  --app-location "/frontend" `
  --output-location "dist"
```

### 4.2 Configure Environment Variables

In Azure Portal:
1. Go to Static Web App > Configuration
2. Add Application Settings:
   - `VITE_API_URL`: `https://<your-backend-app>.azurewebsites.net/api/v1`

Or via CLI:

```bash
az staticwebapp appsettings set `
  --name $STATIC_APP_NAME `
  --setting-names VITE_API_URL="https://${BACKEND_APP_NAME}.azurewebsites.net/api/v1"
```

### 4.3 Deploy via GitHub Actions (Automatic)

Create `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend to Azure Static Web Apps

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main

jobs:
  build_and_deploy:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: true

      - name: Build And Deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/frontend"
          output_location: "dist"
```

Get deployment token:

```bash
az staticwebapp secrets list `
  --name $STATIC_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "properties.apiKey" -o tsv
```

Add to GitHub Secrets as `AZURE_STATIC_WEB_APPS_API_TOKEN`.

---

## Phase 5: Strava Configuration (5 minutes)

Update Strava API settings:

1. Go to: https://www.strava.com/settings/api
2. Update **Authorization Callback Domain**:
   ```
   <your-backend-app>.azurewebsites.net/api/v1/auth/callback
   ```

---

## Phase 6: Monitoring & Logging (15 minutes)

### 6.1 Enable Application Insights

```bash
# Create Application Insights resource
az monitor app-insights component create `
  --app runcoach-insights `
  --location $LOCATION `
  --resource-group $RESOURCE_GROUP `
  --application-type web

# Get instrumentation key
$INSIGHTS_KEY = az monitor app-insights component show `
  --resource-group $RESOURCE_GROUP `
  --app runcoach-insights `
  --query instrumentationKey -o tsv

# Link to App Service
az webapp config appsettings set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=$INSIGHTS_KEY"
```

### 6.2 Configure Alerts

Set up alerts for:
- High CPU usage (>80% for 5 minutes)
- High memory usage (>90%)
- Failed requests (>10 in 5 minutes)
- Database connection failures

```bash
# Example: Alert for high CPU
az monitor metrics alert create `
  --name "High CPU Alert" `
  --resource-group $RESOURCE_GROUP `
  --scopes "/subscriptions/<subscription-id>/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Web/sites/$BACKEND_APP_NAME" `
  --condition "avg Percentage CPU > 80" `
  --window-size 5m `
  --evaluation-frequency 1m
```

---

## Phase 7: Domain & SSL (Optional, 10 minutes)

### 7.1 Custom Domain for Backend

```bash
# Add custom domain
az webapp config hostname add `
  --resource-group $RESOURCE_GROUP `
  --webapp-name $BACKEND_APP_NAME `
  --hostname "api.runcoach.com"

# SSL is automatic with Azure (free managed certificate)
```

### 7.2 Custom Domain for Frontend

```bash
# Add custom domain to Static Web App
az staticwebapp hostname set `
  --name $STATIC_APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --hostname "www.runcoach.com"
```

Update DNS:
- CNAME: `www` → `<your-static-app>.azurestaticapps.net`
- CNAME: `api` → `<your-backend-app>.azurewebsites.net`

---

## Phase 8: Cost Optimization

### 8.1 Enable Auto-Shutdown for Development

For dev/test environments, use auto-shutdown:

```bash
# Scale down App Service during off-hours
az webapp config appsettings set `
  --resource-group $RESOURCE_GROUP `
  --name $BACKEND_APP_NAME `
  --settings WEBSITE_TIME_ZONE="UTC"
```

### 8.2 Use Azure Reserved Instances

For production, buy 1-year reserved capacity:
- App Service: ~30% discount
- PostgreSQL: ~40% discount

### 8.3 Monitor Costs

```bash
# Set budget alert
az consumption budget create `
  --budget-name "RunCoach Monthly Budget" `
  --amount 50 `
  --time-grain Monthly `
  --time-period "$(date -u +%Y-%m-01)to$(date -u -d '+1 year' +%Y-%m-01)" `
  --resource-group $RESOURCE_GROUP
```

---

## Phase 9: Scaling Strategy

### 9.1 Auto-Scaling Rules

```bash
# Enable autoscale for App Service
az monitor autoscale create `
  --resource-group $RESOURCE_GROUP `
  --resource $BACKEND_APP_NAME `
  --resource-type "Microsoft.Web/sites" `
  --name "Autoscale Settings" `
  --min-count 1 `
  --max-count 3 `
  --count 1

# Scale out when CPU > 70%
az monitor autoscale rule create `
  --resource-group $RESOURCE_GROUP `
  --autoscale-name "Autoscale Settings" `
  --condition "Percentage CPU > 70 avg 5m" `
  --scale out 1

# Scale in when CPU < 30%
az monitor autoscale rule create `
  --resource-group $RESOURCE_GROUP `
  --autoscale-name "Autoscale Settings" `
  --condition "Percentage CPU < 30 avg 5m" `
  --scale in 1
```

### 9.2 Database Scaling

When needed, upgrade PostgreSQL:

```bash
# Upgrade to higher tier
az postgres flexible-server update `
  --resource-group $RESOURCE_GROUP `
  --name $DB_SERVER_NAME `
  --sku-name Standard_B2s  # 2 vCores, 4 GB RAM
```

---

## Deployment Checklist

- [ ] Azure account created and CLI installed
- [ ] Resource group created
- [ ] PostgreSQL database deployed and migrations run
- [ ] App Service created and environment variables set
- [ ] Backend deployed and accessible
- [ ] Frontend deployed to Static Web Apps
- [ ] Strava redirect URI updated
- [ ] Cron job configured (WebJob or Azure Function)
- [ ] Application Insights enabled
- [ ] Cost alerts configured
- [ ] Custom domain configured (optional)
- [ ] Auto-scaling rules set (optional)

---

## Maintenance & Operations

### Daily Monitoring

- Check Application Insights dashboard
- Review error logs
- Monitor cost usage

### Weekly Tasks

- Review Monday cron job execution logs
- Check database performance metrics
- Review user feedback

### Monthly Tasks

- Review Azure bill and optimize costs
- Update dependencies (`npm audit`)
- Review and archive old logs
- Database backup verification

---

## Troubleshooting

### Backend Not Starting

```bash
# Check logs
az webapp log tail --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME

# Check environment variables
az webapp config appsettings list --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME
```

### Database Connection Issues

```bash
# Test connection
psql "$DB_CONNECTION_STRING" -c "SELECT 1"

# Check firewall rules
az postgres flexible-server firewall-rule list --resource-group $RESOURCE_GROUP --name $DB_SERVER_NAME
```

### Frontend Not Loading

```bash
# Check Static Web App logs
az staticwebapp show --name $STATIC_APP_NAME --resource-group $RESOURCE_GROUP

# Check environment variables
az staticwebapp appsettings list --name $STATIC_APP_NAME
```

---

## Alternative: Docker Container Deployment

If you prefer containers, deploy to **Azure Container Apps**:

```bash
# Create container app environment
az containerapp env create `
  --name runcoach-env `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION

# Build and push Docker image
docker build -t runcoach-backend ./backend
docker tag runcoach-backend runcoach.azurecr.io/backend:latest
docker push runcoach.azurecr.io/backend:latest

# Deploy container
az containerapp create `
  --name runcoach-api `
  --resource-group $RESOURCE_GROUP `
  --environment runcoach-env `
  --image runcoach.azurecr.io/backend:latest `
  --target-port 3001 `
  --ingress external `
  --env-vars DATABASE_URL="$DB_CONNECTION_STRING" JWT_SECRET="$JWT_SECRET"
```

**Cost**: Similar to App Service (~$15-20/month)

---

## Estimated Performance

| Metric | Expected Value |
|--------|----------------|
| API Response Time | <200ms (avg) |
| Frontend Load Time | <2s (first load) |
| Database Query Time | <50ms (avg) |
| Concurrent Users | 100-500 |
| Uptime | 99.9% |

---

## Next Steps

1. **Deploy to Staging First**: Test with `runcoach-staging` resource group
2. **Load Testing**: Use Apache JMeter or Azure Load Testing
3. **Security Audit**: Enable Azure Security Center
4. **Backup Strategy**: Configure automated backups for database
5. **Disaster Recovery**: Document rollback procedures

---

## Support Resources

- **Azure Documentation**: https://docs.microsoft.com/azure
- **App Service Pricing**: https://azure.microsoft.com/pricing/details/app-service
- **PostgreSQL Pricing**: https://azure.microsoft.com/pricing/details/postgresql
- **Azure Support**: https://azure.microsoft.com/support
