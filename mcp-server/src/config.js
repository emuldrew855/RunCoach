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
  const stravaRedirect = required('STRAVA_REDIRECT_URI');
  if (stravaRedirect !== `${base}/strava/callback`) throw new Error('STRAVA_REDIRECT_URI must match MCP_PUBLIC_URL/strava/callback');
  const origins = (env.MCP_ALLOWED_ORIGINS || '').split(',').filter(Boolean).map(x => new URL(x.trim()).origin);
  return {
    publicUrl: base, resource: `${base}/mcp`, production, port: Number(env.PORT || 3002),
    databaseUrl: required('DATABASE_URL'), clientId: required('MCP_CLIENT_ID'),
    clientSecret: required('MCP_CLIENT_SECRET'), redirects, origins: [base, ...origins],
    stravaClientId: required('STRAVA_CLIENT_ID'), stravaClientSecret: required('STRAVA_CLIENT_SECRET'),
    stravaRedirect,
  };
}
