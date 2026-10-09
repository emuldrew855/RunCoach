targetScope = 'resourceGroup'

param mcpAppName string
param sharedPostgresHost string
param sharedDatabaseName string = 'runcoach'
param backendOrigin string
@secure()
param existingAppSettings object
@minLength(1)
param stravaClientId string
@secure()
@minLength(1)
param stravaClientSecret string
@minLength(1)
param mcpClientId string
@secure()
@minLength(32)
param mcpClientSecret string
@minLength(1)
param redirectUris array

resource app 'Microsoft.Web/sites@2024-04-01' existing = {
  name: mcpAppName
}

var publicUrl = 'https://${app.properties.defaultHostName}'

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: app
  name: 'appsettings'
  properties: union(existingAppSettings, {
    NODE_ENV: 'production'
    HOST: '0.0.0.0'
    PORT: '8080'
    TRUSTED_PROXY_MODE: 'azure-app-service'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    ENABLE_ORYX_BUILD: 'false'
    DATABASE_AUTH_MODE: 'managed-identity'
    DATABASE_URL: 'postgresql://${uriComponent(mcpAppName)}@${sharedPostgresHost}:5432/${uriComponent(sharedDatabaseName)}?sslmode=verify-full'
    STRAVA_CREDENTIAL_STORE: 'shared'
    STRAVA_CLIENT_ID: stravaClientId
    STRAVA_CLIENT_SECRET: stravaClientSecret
    STRAVA_CALLBACK_RELAY_ORIGIN: backendOrigin
    STRAVA_REDIRECT_URI: '${backendOrigin}/api/v1/auth/strava/mcp/callback'
    MCP_PUBLIC_URL: publicUrl
    MCP_CLIENT_ID: mcpClientId
    MCP_CLIENT_SECRET: mcpClientSecret
    MCP_REDIRECT_URIS: join(redirectUris, ',')
    MCP_ALLOWED_ORIGINS: 'https://chatgpt.com'
  })
}

output mcpPublicUrl string = publicUrl
output mcpEndpoint string = '${publicUrl}/mcp'
