targetScope = 'resourceGroup'

@description('Infrastructure only: no OAuth credentials, application settings, or application package are deployed.')
param location string = 'swedencentral'
param mcpAppName string = 'runcoach-mcp-${uniqueString(resourceGroup().id)}'
param mcpPlanName string = 'runcoach-mcp-plan'
param mcpVnetName string = 'runcoach-mcp-vnet'
param postgresServerName string = 'runcoach-mcp-pg-${uniqueString(resourceGroup().id)}'
@allowed(['Standard_B1ms', 'Standard_B2s'])
param postgresSkuName string = 'Standard_B1ms'
@minLength(36)
@maxLength(36)
param entraAdministratorObjectId string
@minLength(1)
param entraAdministratorName string
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
    postgresSkuName: postgresSkuName
    databaseAuthMode: 'entra'
    entraAdministratorObjectId: entraAdministratorObjectId
    entraAdministratorName: entraAdministratorName
    githubRepository: githubRepository
  }
}

output mcpAppServiceName string = infrastructure.outputs.mcpAppServiceName
output mcpPublicUrl string = infrastructure.outputs.mcpPublicUrl
output stravaCallbackUrl string = infrastructure.outputs.stravaCallbackUrl
output postgresHost string = infrastructure.outputs.postgresHost
output postgresDatabase string = infrastructure.outputs.postgresDatabase
output runtimePrincipalId string = infrastructure.outputs.runtimePrincipalId
output azureClientId string = infrastructure.outputs.azureClientId
output azureTenantId string = infrastructure.outputs.azureTenantId
output azureSubscriptionId string = infrastructure.outputs.azureSubscriptionId
