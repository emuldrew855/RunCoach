targetScope = 'resourceGroup'

@description('Deploy into the existing runcoach-prod-rg; this template creates only dedicated MCP resources.')
param location string = 'swedencentral'

@description('Globally unique name for the new MCP Linux App Service.')
param mcpAppName string = 'runcoach-mcp-${uniqueString(resourceGroup().id)}'

param mcpPlanName string = 'runcoach-mcp-plan'
param mcpVnetName string = 'runcoach-mcp-vnet'
param postgresServerName string = 'runcoach-mcp-pg-${uniqueString(resourceGroup().id)}'
param postgresAdministrator string = 'mcpadmin'
@allowed(['Standard_B1ms', 'Standard_B2s'])
param postgresSkuName string = 'Standard_B1ms'

@secure()
param postgresPassword string = ''

@allowed(['password', 'entra'])
param databaseAuthMode string = 'password'
param entraAdministratorObjectId string = ''
param entraAdministratorName string = ''

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
    name: postgresSkuName
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: databaseAuthMode == 'password' ? postgresAdministrator : null
    administratorLoginPassword: databaseAuthMode == 'password' ? postgresPassword : null
    authConfig: {
      activeDirectoryAuth: databaseAuthMode == 'entra' ? 'Enabled' : 'Disabled'
      passwordAuth: databaseAuthMode == 'entra' ? 'Disabled' : 'Enabled'
      tenantId: tenant().tenantId
    }
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

resource entraAdministrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = if (databaseAuthMode == 'entra') {
  parent: postgres
  name: entraAdministratorObjectId
  properties: {
    principalName: entraAdministratorName
    principalType: 'User'
    tenantId: tenant().tenantId
  }
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
  identity: {
    type: 'SystemAssigned'
  }
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
    }
  }
}

var publicUrl = 'https://${app.properties.defaultHostName}'

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
output runtimePrincipalId string = app.identity.principalId
output mcpPublicUrl string = publicUrl
output stravaCallbackUrl string = '${publicUrl}/strava/callback'
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresDatabase string = database.name
output deploymentIdentityId string = deploymentIdentity.id
output azureClientId string = deploymentIdentity.properties.clientId
output azurePrincipalId string = deploymentIdentity.properties.principalId
output azureTenantId string = tenant().tenantId
output azureSubscriptionId string = subscription().subscriptionId
