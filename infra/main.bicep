targetScope = 'subscription'

@description('Azure region for all resources. Must support Linux App Service and PostgreSQL Flexible Server.')
param location string

@description('Resource group to create for RunCoach.')
param resourceGroupName string = 'runcoach-prod'

@description('Lowercase resource-name prefix (letters, digits and hyphens); keep at most 30 characters.')
@minLength(3)
@maxLength(30)
param namePrefix string = 'runcoach'

@allowed([
  'B1'
  'B2'
  'B3'
  'S1'
  'S2'
  'S3'
  'P0v3'
  'P1v3'
  'P2v3'
  'P3v3'
])
param appServiceSku string = 'B1'

param postgresSkuName string = 'Standard_B1ms'

@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param postgresSkuTier string = 'Burstable'

@minValue(32)
param postgresStorageSizeGB int = 32

@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 7

@description('PostgreSQL administrator name. Use letters and digits; Azure reserved administrator names are not permitted.')
param postgresAdministratorLogin string = 'runcoachadmin'

@secure()
@minLength(8)
@maxLength(128)
param postgresAdministratorPassword string

@secure()
@minLength(20)
param openaiApiKey string

param stravaClientId string

@secure()
@minLength(1)
param stravaClientSecret string

@secure()
@minLength(32)
param jwtSecret string

@secure()
@minLength(32)
param serviceSecret string

param openaiModel string = 'gpt-4o'
param agentMiniModel string = 'gpt-4o-mini'

@description('GitHub owner/repository permitted to use the deployment identity via the Prod environment.')
param githubRepository string = 'emuldrew855/RunCoach'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module resources './resources.bicep' = {
  name: 'runcoach-resources'
  scope: resourceGroup
  params: {
    location: location
    namePrefix: namePrefix
    appServiceSku: appServiceSku
    postgresSkuName: postgresSkuName
    postgresSkuTier: postgresSkuTier
    postgresStorageSizeGB: postgresStorageSizeGB
    postgresBackupRetentionDays: postgresBackupRetentionDays
    postgresAdministratorLogin: postgresAdministratorLogin
    postgresAdministratorPassword: postgresAdministratorPassword
    openaiApiKey: openaiApiKey
    stravaClientId: stravaClientId
    stravaClientSecret: stravaClientSecret
    jwtSecret: jwtSecret
    serviceSecret: serviceSecret
    openaiModel: openaiModel
    agentMiniModel: agentMiniModel
    githubRepository: githubRepository
  }
}

output resourceGroupName string = resourceGroup.name
output backendAppName string = resources.outputs.backendAppName
output agentAppName string = resources.outputs.agentAppName
output frontendAppName string = resources.outputs.frontendAppName
output backendUrl string = resources.outputs.backendUrl
output agentUrl string = resources.outputs.agentUrl
output frontendUrl string = resources.outputs.frontendUrl
output stravaRedirectUri string = resources.outputs.stravaRedirectUri
output postgresHostName string = resources.outputs.postgresHostName
output githubClientId string = resources.outputs.githubClientId
output githubTenantId string = tenant().tenantId
output githubSubscriptionId string = subscription().subscriptionId
