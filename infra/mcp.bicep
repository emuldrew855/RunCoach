targetScope = 'resourceGroup'

param location string = 'swedencentral'
param mcpAppName string = 'runcoach-mcp-${uniqueString(resourceGroup().id)}'
param mcpPlanName string = 'runcoach-mcp-plan'
param mcpVnetName string = 'runcoach-mcp-vnet'
param postgresServerName string = 'runcoach-mcp-pg-${uniqueString(resourceGroup().id)}'
param postgresAdministrator string = 'mcpadmin'
@allowed(['Standard_B1ms', 'Standard_B2s'])
param postgresSkuName string = 'Standard_B1ms'

@allowed(['password', 'entra'])
param databaseAuthMode string = 'password'
param entraAdministratorObjectId string = ''
param entraAdministratorName string = ''

@secure()
param postgresPassword string = ''

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
@secure()
@minLength(44)
@maxLength(44)
param mcpCredentialEncryptionKey string
@minLength(1)
param redirectUris array
@minLength(3)
param githubRepository string

module infrastructure './mcp-resources.bicep' = {
  name: 'mcp-resources'
  params: {
    location: location
    mcpAppName: mcpAppName
    mcpPlanName: mcpPlanName
    mcpVnetName: mcpVnetName
    postgresServerName: postgresServerName
    postgresAdministrator: postgresAdministrator
    postgresSkuName: postgresSkuName
    postgresPassword: postgresPassword
    databaseAuthMode: databaseAuthMode
    entraAdministratorObjectId: entraAdministratorObjectId
    entraAdministratorName: entraAdministratorName
    githubRepository: githubRepository
  }
}

resource app 'Microsoft.Web/sites@2024-04-01' existing = {
  name: mcpAppName
}

var publicUrl = infrastructure.outputs.mcpPublicUrl
var databaseUser = databaseAuthMode == 'entra' ? mcpAppName : postgresAdministrator
var databaseCredentials = databaseAuthMode == 'entra' ? uriComponent(databaseUser) : '${uriComponent(databaseUser)}:${uriComponent(postgresPassword)}'

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    NODE_ENV: 'production'
    HOST: '0.0.0.0'
    PORT: '8080'
    TRUSTED_PROXY_MODE: 'azure-app-service'
    WEBSITE_NODE_DEFAULT_VERSION: '~22'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    ENABLE_ORYX_BUILD: 'false'
    DATABASE_AUTH_MODE: databaseAuthMode == 'entra' ? 'managed-identity' : 'password'
    DATABASE_URL: 'postgresql://${databaseCredentials}@${infrastructure.outputs.postgresHost}:5432/${infrastructure.outputs.postgresDatabase}?sslmode=verify-full'
    STRAVA_CREDENTIAL_STORE: 'standalone'
    MCP_CREDENTIAL_ENCRYPTION_KEY: mcpCredentialEncryptionKey
    STRAVA_CLIENT_ID: stravaClientId
    STRAVA_CLIENT_SECRET: stravaClientSecret
    STRAVA_REDIRECT_URI: '${publicUrl}/strava/callback'
    MCP_PUBLIC_URL: publicUrl
    MCP_CLIENT_ID: mcpClientId
    MCP_CLIENT_SECRET: mcpClientSecret
    MCP_REDIRECT_URIS: join(redirectUris, ',')
    MCP_ALLOWED_ORIGINS: 'https://chatgpt.com'
  }
}

output resourceGroupName string = resourceGroup().name
output mcpAppServiceName string = infrastructure.outputs.mcpAppServiceName
output mcpAppServiceId string = infrastructure.outputs.mcpAppServiceId
output runtimePrincipalId string = infrastructure.outputs.runtimePrincipalId
output mcpPublicUrl string = publicUrl
output stravaCallbackUrl string = infrastructure.outputs.stravaCallbackUrl
output postgresHost string = infrastructure.outputs.postgresHost
output postgresDatabase string = infrastructure.outputs.postgresDatabase
output deploymentIdentityId string = infrastructure.outputs.deploymentIdentityId
output azureClientId string = infrastructure.outputs.azureClientId
output azurePrincipalId string = infrastructure.outputs.azurePrincipalId
output azureTenantId string = infrastructure.outputs.azureTenantId
output azureSubscriptionId string = infrastructure.outputs.azureSubscriptionId
