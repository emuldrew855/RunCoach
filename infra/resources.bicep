targetScope = 'resourceGroup'

param location string
param namePrefix string
param appServiceSku string
param postgresSkuName string
param postgresSkuTier string
param postgresStorageSizeGB int
param postgresBackupRetentionDays int
param postgresAdministratorLogin string

@secure()
param postgresAdministratorPassword string

@secure()
param openaiApiKey string

param stravaClientId string

@secure()
param stravaClientSecret string

@secure()
param jwtSecret string

@secure()
param serviceSecret string

param openaiModel string
param agentMiniModel string
param githubRepository string

var suffix = uniqueString(resourceGroup().id)
var appNames = {
  backend: '${namePrefix}-backend-${suffix}'
  agent: '${namePrefix}-agent-${suffix}'
  frontend: '${namePrefix}-frontend-${suffix}'
}
var contributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var appServiceTier = startsWith(appServiceSku, 'B') ? 'Basic' : (startsWith(appServiceSku, 'S') ? 'Standard' : 'PremiumV3')

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.42.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'apps'
        properties: {
          addressPrefix: '10.42.0.0/26'
          delegations: [
            {
              name: 'app-service'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.42.1.0/27'
          delegations: [
            {
              name: 'postgres-flexible'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

var appSubnetId = '${network.id}/subnets/apps'
var postgresSubnetId = '${network.id}/subnets/postgres'

resource privateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${namePrefix}.private.postgres.database.azure.com'
  location: 'global'
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDns
  name: '${namePrefix}-vnet-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: network.id
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg-${suffix}'
  location: location
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    storage: {
      storageSizeGB: postgresStorageSizeGB
      autoGrow: postgresSkuTier == 'Burstable' ? 'Disabled' : 'Enabled'
    }
    backup: {
      backupRetentionDays: postgresBackupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Disabled'
      delegatedSubnetResourceId: postgresSubnetId
      privateDnsZoneArmResourceId: privateDns.id
    }
  }
  dependsOn: [
    dnsLink
  ]
}

resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    source: 'user-override'
    value: 'VECTOR,UUID-OSSP'
  }
}

resource requireTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'require_secure_transport'
  properties: {
    source: 'user-override'
    value: 'ON'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'runcoach'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Both pg clients consume the URL directly; verify-full preserves CA and hostname verification.
var databaseUrl = 'postgresql://${uriComponent(postgresAdministratorLogin)}:${uriComponent(postgresAdministratorPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${database.name}?sslmode=verify-full'

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-linux-plan'
  location: location
  kind: 'linux'
  sku: {
    name: appServiceSku
    tier: appServiceTier
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource apps 'Microsoft.Web/sites@2024-04-01' = [for role in ['backend', 'agent', 'frontend']: {
  name: appNames[role]
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    virtualNetworkSubnetId: role == 'frontend' ? null : appSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: role == 'frontend' ? 'node server.mjs' : 'npm start'
      alwaysOn: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      vnetRouteAllEnabled: false
    }
  }
}]

var backendUrl = 'https://${apps[0].properties.defaultHostName}'
var agentUrl = 'https://${apps[1].properties.defaultHostName}'
var frontendUrl = 'https://${apps[2].properties.defaultHostName}'
var stravaRedirectUri = '${backendUrl}/api/v1/auth/callback'
var commonSettings = {
  NODE_ENV: 'production'
  SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  WEBSITE_RUN_FROM_PACKAGE: '1'
}

// Configure URLs only after all sites exist, avoiding mutual site dependencies.
resource backendSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: apps[0]
  name: 'appsettings'
  properties: union(commonSettings, {
    PORT: '8080'
    DATABASE_URL: databaseUrl
    FRONTEND_URL: frontendUrl
    AGENT_SERVICE_URL: agentUrl
    SERVICE_SECRET: serviceSecret
    JWT_SECRET: jwtSecret
    JWT_EXPIRES_IN: '7d'
    STRAVA_CLIENT_ID: stravaClientId
    STRAVA_CLIENT_SECRET: stravaClientSecret
    STRAVA_REDIRECT_URI: stravaRedirectUri
    OPENAI_API_KEY: openaiApiKey
    OPENAI_MODEL: openaiModel
  })
  dependsOn: [
    extensions
    requireTls
  ]
}

resource agentSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: apps[1]
  name: 'appsettings'
  properties: union(commonSettings, {
    PORT: '8080'
    DATABASE_URL: databaseUrl
    OPENAI_API_KEY: openaiApiKey
    DEFAULT_MODEL: openaiModel
    MINI_MODEL: agentMiniModel
    BACKEND_API_URL: backendUrl
    SERVICE_SECRET: serviceSecret
    BACKEND_SERVICE_TOKEN: serviceSecret
    DAILY_TOKEN_LIMIT: '50000'
    USE_SUPERVISOR_ARCHITECTURE: 'false'
  })
  dependsOn: [
    extensions
    requireTls
  ]
}

resource frontendSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: apps[2]
  name: 'appsettings'
  properties: union(commonSettings, {
    PORT: '8080'
  })
}

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-github'
  location: location
}

resource githubFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-prod'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:Prod'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

resource githubContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, githubIdentity.id, contributorRoleId)
  properties: {
    roleDefinitionId: contributorRoleId
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output backendAppName string = apps[0].name
output agentAppName string = apps[1].name
output frontendAppName string = apps[2].name
output backendUrl string = backendUrl
output agentUrl string = agentUrl
output frontendUrl string = frontendUrl
output stravaRedirectUri string = stravaRedirectUri
output postgresHostName string = postgres.properties.fullyQualifiedDomainName
output githubClientId string = githubIdentity.properties.clientId
