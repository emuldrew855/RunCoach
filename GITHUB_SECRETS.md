# GitHub Secrets Configuration

To enable automated deployment via GitHub Actions, you need to configure the following secrets in your GitHub repository.

## How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret below

---

## Required Secrets

### AZURE_CREDENTIALS

Azure Service Principal credentials for authentication.

**How to get this value:**

```powershell
# Create service principal
az ad sp create-for-rbac \
  --name "runcoach-github-deploy" \
  --role contributor \
  --scopes /subscriptions/<your-subscription-id>/resourceGroups/runcoach-prod \
  --sdk-auth
```

This will output JSON. Copy the entire JSON output and paste it as the secret value.

Example output:
```json
{
  "clientId": "xxxx",
  "clientSecret": "xxxx",
  "subscriptionId": "xxxx",
  "tenantId": "xxxx",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

---

### AZURE_BACKEND_APP_NAME

Name of your Azure App Service for the backend.

**Example:** `runcoach-api-prod-1234`

**How to get this value:**
```powershell
az webapp list --resource-group runcoach-prod --query "[].name" -o tsv
```

---

### AZURE_STATIC_WEB_APPS_API_TOKEN

Deployment token for Azure Static Web Apps.

**How to get this value:**
```powershell
az staticwebapp secrets list \
  --name runcoach-web-prod \
  --resource-group runcoach-prod \
  --query "properties.apiKey" -o tsv
```

Or get it from Azure Portal:
1. Go to your Static Web App
2. Click **Manage deployment token**
3. Copy the token

---

### BACKEND_URL

Full URL of your deployed backend.

**Example:** `https://runcoach-api-prod-1234.azurewebsites.net`

**How to get this value:**
```powershell
az webapp show \
  --resource-group runcoach-prod \
  --name <your-backend-app-name> \
  --query defaultHostName -o tsv
```

Then add `https://` prefix: `https://runcoach-api-prod-1234.azurewebsites.net`

---

### FRONTEND_URL

Full URL of your deployed frontend.

**Example:** `https://runcoach-web-prod.azurestaticapps.net`

**How to get this value:**
```powershell
az staticwebapp show \
  --name runcoach-web-prod \
  --resource-group runcoach-prod \
  --query defaultHostname -o tsv
```

Then add `https://` prefix: `https://runcoach-web-prod.azurestaticapps.net`

---

### VITE_API_URL

Backend API URL for frontend environment variable.

**Example:** `https://runcoach-api-prod-1234.azurewebsites.net/api/v1`

This is the same as `BACKEND_URL` but with `/api/v1` appended.

---

## Optional Secrets (for enhanced workflows)

### SLACK_WEBHOOK_URL

Webhook URL for Slack notifications on deployment.

### TEAMS_WEBHOOK_URL

Webhook URL for Microsoft Teams notifications.

---

## Verification

After adding all secrets, verify they're set correctly:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all 6 required secrets listed
3. Trigger a deployment by pushing to `main` branch
4. Monitor the deployment in **Actions** tab

---

## Troubleshooting

### "Authentication failed" error

- Verify `AZURE_CREDENTIALS` is valid JSON
- Check service principal has `Contributor` role on resource group
- Ensure subscription ID matches your Azure subscription

### "Resource not found" error

- Verify `AZURE_BACKEND_APP_NAME` matches actual App Service name
- Check resource group name in workflow file matches Azure

### Frontend deployment fails

- Verify `AZURE_STATIC_WEB_APPS_API_TOKEN` is correct
- Check token hasn't expired
- Ensure Static Web App exists in Azure

---

## Security Best Practices

1. **Never commit secrets to Git** - Always use GitHub Secrets
2. **Rotate credentials regularly** - Update service principal credentials every 90 days
3. **Use least privilege** - Service principal should only have access to specific resource group
4. **Enable branch protection** - Require pull request reviews before merging to `main`
5. **Audit secret access** - Regularly review who has access to secrets

---

## Next Steps

After configuring secrets:

1. Push code to `main` branch
2. GitHub Actions will automatically deploy
3. Monitor deployment progress in **Actions** tab
4. Verify deployment with health checks
5. Test application at production URLs
