# RunCoach Azure Deployment Script
# PowerShell script to automate Azure deployment

param(
    [Parameter(Mandatory=$true)]
    [string]$Environment = "prod",  # prod, staging, or dev

    [Parameter(Mandatory=$false)]
    [string]$Location = "eastus"
)

# Color output functions
function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Configuration
$RESOURCE_GROUP = "runcoach-$Environment"
$DB_SERVER_NAME = "runcoach-db-$Environment-$(Get-Random -Maximum 9999)"
$BACKEND_APP_NAME = "runcoach-api-$Environment-$(Get-Random -Maximum 9999)"
$STATIC_APP_NAME = "runcoach-web-$Environment"
$APP_SERVICE_PLAN = "runcoach-plan-$Environment"
$INSIGHTS_NAME = "runcoach-insights-$Environment"

Write-Host @"
╔═══════════════════════════════════════════════════════════╗
║         RunCoach Azure Deployment Script                 ║
║                                                           ║
║  Environment: $Environment
║  Location:    $Location
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# Check if logged in to Azure
Write-Step "Checking Azure CLI login status"
$loginStatus = az account show 2>$null
if (-not $loginStatus) {
    Write-Host "Not logged in to Azure. Please login..." -ForegroundColor Yellow
    az login
}
Write-Success "Logged in to Azure"

# Get subscription ID
$SUBSCRIPTION_ID = az account show --query id -o tsv
Write-Host "Using subscription: $SUBSCRIPTION_ID"

# Prompt for sensitive information
Write-Step "Collecting configuration"

$DB_ADMIN_PASSWORD = Read-Host "Enter PostgreSQL admin password (min 8 chars)" -AsSecureString
$DB_ADMIN_PASSWORD_TEXT = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DB_ADMIN_PASSWORD)
)

$STRAVA_CLIENT_ID = Read-Host "Enter Strava Client ID"
$STRAVA_CLIENT_SECRET = Read-Host "Enter Strava Client Secret" -AsSecureString
$STRAVA_CLIENT_SECRET_TEXT = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($STRAVA_CLIENT_SECRET)
)

$OPENAI_API_KEY = Read-Host "Enter OpenAI API Key" -AsSecureString
$OPENAI_API_KEY_TEXT = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($OPENAI_API_KEY)
)

# Generate JWT secret
$JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

Write-Success "Configuration collected"

# Create Resource Group
Write-Step "Creating resource group: $RESOURCE_GROUP"
az group create --name $RESOURCE_GROUP --location $Location | Out-Null
Write-Success "Resource group created"

# Create PostgreSQL Database
Write-Step "Creating PostgreSQL Flexible Server (this may take 5-10 minutes)"
az postgres flexible-server create `
    --resource-group $RESOURCE_GROUP `
    --name $DB_SERVER_NAME `
    --location $Location `
    --admin-user runcoach_admin `
    --admin-password $DB_ADMIN_PASSWORD_TEXT `
    --sku-name Standard_B1ms `
    --tier Burstable `
    --storage-size 32 `
    --version 14 `
    --public-access 0.0.0.0 `
    --yes | Out-Null

Write-Success "PostgreSQL server created: $DB_SERVER_NAME"

# Create database
Write-Step "Creating database"
az postgres flexible-server db create `
    --resource-group $RESOURCE_GROUP `
    --server-name $DB_SERVER_NAME `
    --database-name runcoach | Out-Null

Write-Success "Database 'runcoach' created"

# Configure firewall
Write-Step "Configuring database firewall"
az postgres flexible-server firewall-rule create `
    --resource-group $RESOURCE_GROUP `
    --name $DB_SERVER_NAME `
    --rule-name AllowAzureServices `
    --start-ip-address 0.0.0.0 `
    --end-ip-address 0.0.0.0 | Out-Null

Write-Success "Firewall configured"

# Build connection string
$DB_CONNECTION_STRING = "postgresql://runcoach_admin:${DB_ADMIN_PASSWORD_TEXT}@${DB_SERVER_NAME}.postgres.database.azure.com/runcoach?sslmode=require"

# Run migrations
Write-Step "Running database migrations"
Push-Location backend
$env:DATABASE_URL = $DB_CONNECTION_STRING
npm run build | Out-Null
node -e "require('./dist/config/database').runMigrations().then(() => process.exit(0)).catch(e => {console.error(e); process.exit(1)})"
Pop-Location
Write-Success "Migrations completed"

# Create App Service Plan
Write-Step "Creating App Service Plan"
az appservice plan create `
    --name $APP_SERVICE_PLAN `
    --resource-group $RESOURCE_GROUP `
    --location $Location `
    --sku B1 `
    --is-linux | Out-Null

Write-Success "App Service Plan created"

# Create Web App
Write-Step "Creating Web App: $BACKEND_APP_NAME"
az webapp create `
    --resource-group $RESOURCE_GROUP `
    --plan $APP_SERVICE_PLAN `
    --name $BACKEND_APP_NAME `
    --runtime "NODE:18-lts" | Out-Null

Write-Success "Web App created"

# Configure Web App
Write-Step "Configuring Web App settings"

az webapp update `
    --resource-group $RESOURCE_GROUP `
    --name $BACKEND_APP_NAME `
    --https-only true | Out-Null

az webapp config set `
    --resource-group $RESOURCE_GROUP `
    --name $BACKEND_APP_NAME `
    --always-on true `
    --startup-file "node dist/index.js" | Out-Null

Write-Success "Web App configured"

# Set environment variables
Write-Step "Setting environment variables"

$BACKEND_URL = "https://${BACKEND_APP_NAME}.azurewebsites.net"

az webapp config appsettings set `
    --resource-group $RESOURCE_GROUP `
    --name $BACKEND_APP_NAME `
    --settings `
        NODE_ENV=production `
        PORT=8080 `
        DATABASE_URL="$DB_CONNECTION_STRING" `
        JWT_SECRET="$JWT_SECRET" `
        JWT_EXPIRES_IN=7d `
        STRAVA_CLIENT_ID="$STRAVA_CLIENT_ID" `
        STRAVA_CLIENT_SECRET="$STRAVA_CLIENT_SECRET_TEXT" `
        STRAVA_REDIRECT_URI="${BACKEND_URL}/api/v1/auth/callback" `
        OPENAI_API_KEY="$OPENAI_API_KEY_TEXT" `
        OPENAI_MODEL=gpt-4o `
        OPENAI_MAX_TOKENS=1000 `
        FRONTEND_URL="https://${STATIC_APP_NAME}.azurestaticapps.net" | Out-Null

Write-Success "Environment variables set"

# Deploy backend
Write-Step "Deploying backend code"
Push-Location backend
npm run build | Out-Null

# Create deployment package
$deployPath = "$env:TEMP\runcoach-backend-deploy"
if (Test-Path $deployPath) {
    Remove-Item -Recurse -Force $deployPath
}
New-Item -ItemType Directory -Path $deployPath | Out-Null

# Copy necessary files
Copy-Item -Recurse dist $deployPath\
Copy-Item -Recurse node_modules $deployPath\
Copy-Item package.json $deployPath\
Copy-Item package-lock.json $deployPath\

# Zip deployment
$zipPath = "$env:TEMP\runcoach-backend.zip"
Compress-Archive -Path "$deployPath\*" -DestinationPath $zipPath -Force

# Deploy to Azure
az webapp deployment source config-zip `
    --resource-group $RESOURCE_GROUP `
    --name $BACKEND_APP_NAME `
    --src $zipPath | Out-Null

Pop-Location
Write-Success "Backend deployed"

# Create Application Insights
Write-Step "Creating Application Insights"
az monitor app-insights component create `
    --app $INSIGHTS_NAME `
    --location $Location `
    --resource-group $RESOURCE_GROUP `
    --application-type web | Out-Null

$INSIGHTS_KEY = az monitor app-insights component show `
    --resource-group $RESOURCE_GROUP `
    --app $INSIGHTS_NAME `
    --query instrumentationKey -o tsv

az webapp config appsettings set `
    --resource-group $RESOURCE_GROUP `
    --name $BACKEND_APP_NAME `
    --settings APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=$INSIGHTS_KEY" | Out-Null

Write-Success "Application Insights configured"

# Create Static Web App
Write-Step "Creating Static Web App"

Write-Host @"

To complete the Static Web App deployment:
1. Go to: https://portal.azure.com
2. Create a new Static Web App resource
3. Name: $STATIC_APP_NAME
4. Region: $Location
5. Connect to your GitHub repository
6. Build configuration:
   - App location: /frontend
   - Output location: dist
7. Set environment variable:
   VITE_API_URL = $BACKEND_URL/api/v1

Alternatively, you can deploy using GitHub Actions.
"@ -ForegroundColor Yellow

# Summary
Write-Host @"

╔═══════════════════════════════════════════════════════════╗
║              Deployment Complete! 🎉                      ║
╚═══════════════════════════════════════════════════════════╝

Backend URL:    $BACKEND_URL
API Endpoint:   $BACKEND_URL/api/v1
Health Check:   $BACKEND_URL/health

Database:       $DB_SERVER_NAME.postgres.database.azure.com
Resource Group: $RESOURCE_GROUP

IMPORTANT NEXT STEPS:

1. Update Strava API Settings:
   - Go to: https://www.strava.com/settings/api
   - Set redirect URI: $BACKEND_URL/api/v1/auth/callback

2. Complete Frontend Deployment:
   - Deploy Static Web App via Azure Portal or GitHub Actions
   - Set VITE_API_URL to: $BACKEND_URL/api/v1

3. Test the deployment:
   - Visit: $BACKEND_URL/health
   - Should return: {"status":"ok"}

4. Monitor your application:
   - Application Insights: https://portal.azure.com/#blade/Microsoft_Azure_Monitoring/AzureMonitoringBrowseBlade/applicationInsights

Estimated monthly cost: ~$30-40 USD

"@ -ForegroundColor Green

Write-Host "Deployment details saved to deployment-info.txt" -ForegroundColor Cyan

# Save deployment info
@"
RunCoach Azure Deployment Info
Generated: $(Get-Date)
Environment: $Environment

Backend URL: $BACKEND_URL
Database Server: $DB_SERVER_NAME.postgres.database.azure.com
Resource Group: $RESOURCE_GROUP

Database Connection String:
$DB_CONNECTION_STRING

Backend App Name: $BACKEND_APP_NAME
Static App Name: $STATIC_APP_NAME

Strava Redirect URI:
$BACKEND_URL/api/v1/auth/callback

"@ | Out-File -FilePath "deployment-info.txt"

Write-Success "Deployment script complete!"
