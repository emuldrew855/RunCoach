import express from 'express';
import { rateLimit, MemoryStore } from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { random, hash, equal, SafeError } from './store.js';
import { Strava } from './strava.js';
import { registerTools } from './tools.js';
import { STRAVA_SCOPES } from './config.js';

const escape = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const field = (req, name) => typeof req.body?.[name] === 'string' ? req.body[name] : '';
const query = (req, name) => typeof req.query[name] === 'string' ? req.query[name] : '';
const cookie = (req, name) => {
  const part = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
};
const html = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RunCoach MCP</title></head><body>${body}</body></html>`;
export class BoundedRateStore extends MemoryStore {
  async increment(key) {
    if (!this.current.has(key) && !this.previous.has(key) && this.current.size + this.previous.size >= 5000) {
      return { totalHits: Number.MAX_SAFE_INTEGER, resetTime: new Date(Date.now() + this.windowMs) };
    }
    return super.increment(key);
  }
}
const limit = max => rateLimit({ windowMs: 60_000, limit: max, store: new BoundedRateStore(), standardHeaders: 'draft-8', legacyHeaders: false, identifier: 'mcp-pilot', validate: { xForwardedForHeader: false } });

export function createApp({ config, store, fetchImpl = fetch, strava = new Strava(config, store, fetchImpl) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxy ?? 'loopback');
  app.use((req, res, next) => {
    // Strip OAuth paths/queries from referrers without making form POST origins opaque.
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin',
      'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff' });
    const host = req.headers.host;
    if (host !== new URL(config.publicUrl).host || (req.headers.origin && !config.origins.includes(req.headers.origin))) return res.status(403).json({ error: 'untrusted_origin' });
    // Only one canonical protocol value from a trusted ingress is accepted.
    // Express otherwise accepts the first value of an attacker-controlled chain.
    if (config.production && (!req.secure ||
        (!req.socket.encrypted && req.headers['x-forwarded-proto'] !== 'https'))) {
      return res.status(400).json({ error: 'https_required' });
    }
    // The reverse proxy must strip/replace forwarded headers and terminate TLS.
    if (req.headers.origin) {
      res.set({ 'Access-Control-Allow-Origin': req.headers.origin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
        'Access-Control-Expose-Headers': 'WWW-Authenticate' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(limit(120));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(express.json({ limit: '64kb' }));
  const setCookie = (res, name, value, maxAge) => res.cookie(name, value, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/', maxAge });
  const authenticatedClient = req => {
    let id = field(req, 'client_id'), secret = field(req, 'client_secret');
    if (req.headers.authorization) {
      if (id || secret || !req.headers.authorization.startsWith('Basic ')) throw new SafeError('invalid_client', 401);
      const decoded = Buffer.from(req.headers.authorization.slice(6), 'base64').toString();
      const index = decoded.indexOf(':');
      try { id = decodeURIComponent(decoded.slice(0, index)); secret = decodeURIComponent(decoded.slice(index + 1)); }
      catch { throw new SafeError('invalid_client', 401); }
      if (index < 0) throw new SafeError('invalid_client', 401);
    }
    if (!equal(id, config.clientId) || !equal(secret, config.clientSecret)) throw new SafeError('invalid_client', 401);
    return id;
  };
  const redirect = (data, params) => {
    const url = new URL(data.redirectUri);
    for (const [key, value] of Object.entries({ ...params, state: data.state, iss: config.publicUrl })) url.searchParams.set(key, value);
    return url.href;
  };
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
    issuer: config.publicUrl, authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${config.publicUrl}/oauth/authorize`,
    token_endpoint: `${config.publicUrl}/oauth/token`, revocation_endpoint: `${config.publicUrl}/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'], scopes_supported: ['runcoach:read'],
  }));
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json({
    resource: config.resource, authorization_servers: [config.publicUrl], scopes_supported: ['runcoach:read'], bearer_methods_supported: ['header'],
  }));
  app.get('/oauth/authorize', async (req, res) => {
    const data = { clientId: query(req, 'client_id'), redirectUri: query(req, 'redirect_uri'),
      state: query(req, 'state'), challenge: query(req, 'code_challenge'), resource: query(req, 'resource') || config.resource };
    if (data.clientId !== config.clientId || !config.redirects.includes(data.redirectUri) ||
        query(req, 'response_type') !== 'code' || query(req, 'scope') !== 'runcoach:read' ||
        !data.state || data.state.length > 1024 || !/^[A-Za-z0-9_-]{43}$/.test(data.challenge) ||
        query(req, 'code_challenge_method') !== 'S256' || data.resource !== config.resource) throw new SafeError('invalid_request');
    const state = random(), browser = random();
    await store.createRequest(state, hash(browser), data);
    setCookie(res, 'mcp_browser', browser, 600_000);
    const url = new URL('https://www.strava.com/oauth/authorize');
    url.search = new URLSearchParams({ client_id: config.stravaClientId, redirect_uri: config.stravaRedirect,
      response_type: 'code', approval_prompt: 'force', scope: STRAVA_SCOPES.join(','), state }).toString();
    res.redirect(url.href);
  });
  app.get('/strava/callback', async (req, res) => {
    const state = query(req, 'state'), browser = cookie(req, 'mcp_browser');
    if (!state || !browser) throw new SafeError('invalid_state');
    if (query(req, 'error')) {
      const data = await store.denyAuthorization(state, hash(browser));
      res.clearCookie('mcp_browser', { path: '/' });
      res.redirect(redirect(data, { error: 'access_denied' }));
      return;
    }
    const data = await store.stravaCallback(state, hash(browser), async () => {
      const scopes = query(req, 'scope').split(',');
      if (query(req, 'error') || !query(req, 'code') || !STRAVA_SCOPES.every(scope => scopes.includes(scope))) throw new SafeError('strava_consent_required');
      return strava.authorize(query(req, 'code'));
    });
    const connectionNotice = config.storageMode === 'standalone'
      ? 'You have authorized the MCP Strava app. Its connection credentials are stored separately from RunCoach.'
      : 'You have authorized the existing RunCoach Strava app. Its shared connection credentials have been updated to preserve RunCoach access.';
    res.type('html').send(html(`<h1>Allow ChatGPT read-only running access?</h1><p>Strava account ${escape(data.athleteId)}. This grants access to run metrics and summaries for 30 days, not GPS, private descriptions, or write actions.</p><p>${connectionNotice} Denying below prevents ChatGPT access, but does not undo Strava app authorization.</p><form method="post" action="/oauth/consent"><input type="hidden" name="request" value="${escape(state)}"><input type="hidden" name="csrf" value="${escape(data.csrf)}"><button name="decision" value="allow">Allow</button><button name="decision" value="deny">Deny</button></form><p>You can disconnect this grant at <a href="/connections">Connections</a> after approval. Disconnect does not deauthorize the Strava app.</p>`));
  });
  app.post('/oauth/consent', async (req, res) => {
    if (!['allow', 'deny'].includes(field(req, 'decision')) || !cookie(req, 'mcp_browser')) throw new SafeError('invalid_consent');
    const result = await store.consent(field(req, 'request'), hash(cookie(req, 'mcp_browser')), field(req, 'csrf'), field(req, 'decision') === 'allow');
    res.clearCookie('mcp_browser', { path: '/' });
    if (result.management) setCookie(res, 'mcp_management', result.management, 1800_000);
    res.redirect(redirect(result.data, result.code ? { code: result.code } : { error: 'access_denied' }));
  });
  app.post('/oauth/token', async (req, res) => {
    const clientId = authenticatedClient(req), kind = field(req, 'grant_type');
    const resource = field(req, 'resource');
    if (resource && resource !== config.resource) throw new SafeError('invalid_target');
    if (kind === 'authorization_code') {
      const verifier = field(req, 'code_verifier');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new SafeError('invalid_grant');
      res.json(await store.exchange(field(req, 'code'), 'code', clientId,
        data => data.redirectUri === field(req, 'redirect_uri') && equal(data.challenge, hash(verifier)) && data.resource === config.resource, config.resource));
    } else if (kind === 'refresh_token') {
      if (field(req, 'scope') && field(req, 'scope') !== 'runcoach:read') throw new SafeError('invalid_scope');
      res.json(await store.exchange(field(req, 'refresh_token'), 'refresh', clientId, () => true, config.resource));
    } else throw new SafeError('unsupported_grant_type');
  });
  app.post('/oauth/revoke', async (req, res) => {
    const clientId = authenticatedClient(req);
    if (!field(req, 'token')) throw new SafeError('invalid_request');
    await store.revoke(field(req, 'token'), clientId); res.sendStatus(200);
  });
  app.get('/connections', async (req, res) => {
    const token = cookie(req, 'mcp_management');
    const grant = await store.authenticate(token, 'management');
    if (grant.resource !== config.resource || grant.client_id !== config.clientId) throw new SafeError('invalid_token', 401);
    res.type('html').send(html(`<h1>RunCoach MCP connection</h1><p>Disconnect only this ChatGPT grant, not the Strava app.</p><form method="post" action="/connections"><input type="hidden" name="csrf" value="${escape(hash(token + ':disconnect'))}"><button>Disconnect</button></form>`));
  });
  app.post('/connections', async (req, res) => {
    const token = cookie(req, 'mcp_management');
    const grant = await store.authenticate(token, 'management');
    if (grant.resource !== config.resource || grant.client_id !== config.clientId) throw new SafeError('invalid_token', 401);
    if (!equal(grant.data.csrfHash, field(req, 'csrf'))) throw new SafeError('invalid_consent');
    await store.revoke(token, config.clientId, 'management');
    res.clearCookie('mcp_management', { path: '/' });
    res.type('html').send(html('<h1>Disconnected</h1><p>This MCP grant is revoked. The Strava app remains authorized.</p>'));
  });
  const perGrant = rateLimit({ windowMs: 60_000, limit: 60, store: new BoundedRateStore(), keyGenerator: req => req.grant.id,
    standardHeaders: 'draft-8', legacyHeaders: false, identifier: 'grant' });
  app.use('/mcp', async (req, res, next) => {
    try {
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer' + ' ') || !/^[A-Za-z0-9_-]{43}$/.test(auth.slice(7))) throw new SafeError('invalid_token', 401);
      req.grant = await store.authenticate(auth.slice(7));
      if (req.grant.client_id !== config.clientId || req.grant.resource !== config.resource) throw new SafeError('invalid_token', 401);
      next();
    } catch {
      res.set('WWW-Authenticate', ['Bearer', 'resource_metadata="' + config.publicUrl + '/.well-known/oauth-protected-resource/mcp", error="invalid_token"'].join(' '));
      res.status(401).json({ error: 'invalid_token' });
    }
  }, perGrant);
  app.post('/mcp', async (req, res) => {
    const server = new McpServer({ name: 'runcoach-strava-readonly', version: '1.0.0' });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    registerTools(server, req.grant, strava);
    res.on('close', () => { void transport.close().catch(() => {}); void server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const safe = error instanceof SafeError;
    if (safe && error.retryAfter) res.set('Retry-After', error.retryAfter);
    res.status(safe ? error.status : error.status === 413 ? 413 : 500).json({ error: safe ? error.code : error.status === 413 ? 'payload_too_large' : 'service_unavailable' });
  });
  return app;
}
