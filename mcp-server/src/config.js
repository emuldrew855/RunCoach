import { isIP } from 'node:net';

export const STRAVA_SCOPES = ['read', 'activity:read_all', 'profile:read_all'];

export function loadConfig(env = process.env) {
  const required = name => {
    if (!env[name]) throw new Error(`Missing ${name}`);
    return env[name];
  };
  const publicUrl = new URL(required('MCP_PUBLIC_URL'));
  const production = (env.NODE_ENV || 'production') === 'production';
  if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash ||
      publicUrl.pathname !== '/' || (publicUrl.protocol !== 'https:' &&
      !( !production && publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname)))) {
    throw new Error('MCP_PUBLIC_URL must be an HTTPS origin (loopback HTTP only in development)');
  }
  const base = publicUrl.origin;
  const redirects = required('MCP_REDIRECT_URIS').split(',').map(x => x.trim());
  for (const redirect of redirects) {
    const url = new URL(redirect);
    if (url.protocol !== 'https:' || url.hash || url.username || url.password) throw new Error('Invalid MCP_REDIRECT_URIS');
  }
  const origins = (env.MCP_ALLOWED_ORIGINS || '').split(',').filter(Boolean).map(x => new URL(x.trim()).origin);
  const storageMode = env.STRAVA_CREDENTIAL_STORE || 'shared';
  if (!['shared', 'standalone'].includes(storageMode)) throw new Error('Invalid STRAVA_CREDENTIAL_STORE');
  const stravaRedirect = required('STRAVA_REDIRECT_URI');
  let callback = `${base}/strava/callback`;
  if (env.STRAVA_CALLBACK_RELAY_ORIGIN) {
    const relay = new URL(env.STRAVA_CALLBACK_RELAY_ORIGIN);
    if (storageMode !== 'shared' || relay.protocol !== 'https:' ||
        relay.origin !== env.STRAVA_CALLBACK_RELAY_ORIGIN) {
      throw new Error('STRAVA_CALLBACK_RELAY_ORIGIN requires shared storage and an exact HTTPS origin');
    }
    callback = `${relay.origin}/api/v1/auth/strava/mcp/callback`;
  }
  if (stravaRedirect !== callback) throw new Error('STRAVA_REDIRECT_URI must match the configured callback');
  let credentialEncryptionKey;
  if (storageMode === 'standalone') {
    const encoded = required('MCP_CREDENTIAL_ENCRYPTION_KEY');
    credentialEncryptionKey = Buffer.from(encoded, 'base64');
    if (credentialEncryptionKey.length !== 32 || credentialEncryptionKey.toString('base64') !== encoded) {
      throw new Error('MCP_CREDENTIAL_ENCRYPTION_KEY must be canonical base64 encoding of 32 bytes');
    }
  }
  const trustedProxyMode = env.TRUSTED_PROXY_MODE || 'loopback';
  if (!['loopback', 'azure-app-service', 'cidrs'].includes(trustedProxyMode)) throw new Error('Invalid TRUSTED_PROXY_MODE');
  if (env.TRUSTED_PROXY_CIDRS && trustedProxyMode !== 'cidrs') throw new Error('TRUSTED_PROXY_CIDRS requires TRUSTED_PROXY_MODE=cidrs');
  let trustedProxy = trustedProxyMode === 'azure-app-service' ? 1 : 'loopback';
  if (trustedProxyMode === 'cidrs') {
    trustedProxy = required('TRUSTED_PROXY_CIDRS').split(',').map(x => x.trim());
    for (const cidr of trustedProxy) {
      const [address, prefix, ...extra] = cidr.split('/');
      const family = isIP(address);
      if (!family || extra.length || (prefix !== undefined &&
          (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
        throw new Error('Invalid TRUSTED_PROXY_CIDRS');
      }
    }
  }
  const port = Number(env.PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    publicUrl: base, resource: `${base}/mcp`, production, port, host: env.HOST || '127.0.0.1',
    storageMode, credentialEncryptionKey, trustedProxyMode, trustedProxy,
    useSharedLockFunction: storageMode === 'shared' && env.DATABASE_AUTH_MODE === 'managed-identity',
    databaseUrl: required('DATABASE_URL'), clientId: required('MCP_CLIENT_ID'),
    clientSecret: required('MCP_CLIENT_SECRET'), redirects, origins: [base, ...origins],
    stravaClientId: required('STRAVA_CLIENT_ID'), stravaClientSecret: required('STRAVA_CLIENT_SECRET'),
    stravaRedirect,
  };
}
