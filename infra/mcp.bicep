targetScope = 'resourceGroup'

@description('Deploy into the existing runcoach-prod-rg; this template creates only dedicated MCP resources.')
param location string = 'swedencentral'

@description('Globally unique name for the new MCP Linux App Service.')
param mcpAppName string = 'runcoach-mcp-${uniqueString(resourceGroup().id)}'

param mcpPlanName string = 'runcoach-mcp-plan'
param mcpVnetName string = 'runcoach-mcp-vnet'
param postgresServerName string = 'runcoach-mcp-pg-${uniqueString(resourceGroup().id)}'
param postgresAdministrator string = 'mcpadmin'

@secure()
@minLength(16)
param postgresPassword string

@description('Client ID of a separately registered Strava application, never the full-stack RunCoach application.')
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

@description('Persistent canonical base64 encoding of 32 random bytes. Reuse on redeploy; changing it loses access to stored Strava credentials.')
@secure()
@minLength(44)
@maxLength(44)
param mcpCredentialEncryptionKey string

@description('Exact HTTPS callback URI allowlist copied from the ChatGPT connector; no wildcard or origin-only entries.')
@minLength(1)
param redirectUris array

@description('GitHub owner/repository authorized for the protected ProdMcp environment.')
@minLength(3)
param githubRepository string

var websiteContributorRoleId = 'de139f84-1756-47ae-9be6-808fbbe84772'
var readerRoleId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: mcpVnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: ['10.42.0.0/16']
    }
  }
}

resource databaseSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'postgres'
  properties: {
    addressPrefix: '10.42.0.0/24'
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

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'app-service'
  properties: {
    addressPrefix: '10.42.1.0/24'
    delegations: [
      {
        name: 'app-service'
        properties: {
          serviceName: 'Microsoft.Web/serverFarms'
        }
      }
    ]
  }
  // Serialize subnet writes against the same VNet.
  dependsOn: [databaseSubnet]
}

resource privateDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${postgresServerName}.private.postgres.database.azure.com'
  location: 'global'
}

resource privateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: privateDns
  name: 'mcp-vnet'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdministrator
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: databaseSubnet.id
      privateDnsZoneArmResourceId: privateDns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [privateDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'runcoach_mcp'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource requireSsl 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'require_secure_transport'
  properties: {
    value: 'on'
    source: 'user-override'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: mcpPlanName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: mcpAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    virtualNetworkSubnetId: appSubnet.id
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm start'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      vnetRouteAllEnabled: true
      healthCheckPath: '/health'
    }
  }
}

var publicUrl = 'https://${app.properties.defaultHostName}'

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
    DATABASE_URL: 'postgresql://${postgresAdministrator}:${uriComponent(postgresPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${database.name}?sslmode=verify-full'
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
  dependsOn: [requireSsl]
}

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${mcpAppName}-github'
  location: location
}

resource githubFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-prod-mcp'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:ProdMcp'
    audiences: ['api://AzureADTokenExchange']
  }
}

// Bootstrap requires an owner/RBAC administrator. The workflow cannot deploy infra.
resource appDeploymentRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(app.id, deploymentIdentity.id, websiteContributorRoleId)
  scope: app
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', websiteContributorRoleId)
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource resourceGroupReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentity.id, readerRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleId)
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output resourceGroupName string = resourceGroup().name
output mcpAppServiceName string = app.name
output mcpAppServiceId string = app.id
output mcpPublicUrl string = publicUrl
output stravaCallbackUrl string = '${publicUrl}/strava/callback'
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresDatabase string = database.name
output deploymentIdentityId string = deploymentIdentity.id
output azureClientId string = deploymentIdentity.properties.clientId
output azurePrincipalId string = deploymentIdentity.properties.principalId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
