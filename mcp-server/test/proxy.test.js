import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { hash } from '../src/store.js';

const config = {
  publicUrl: 'https://mcp.example.com', resource: 'https://mcp.example.com/mcp',
  production: true, origins: ['https://mcp.example.com'], clientId: 'test-client',
  clientSecret: 'test-secret', redirects: ['https://chatgpt.com/callback'],
  stravaClientId: 'test-strava', stravaRedirect: 'https://mcp.example.com/strava/callback',
};

async function fixture(t, overrides = {}, remoteAddress) {
  const store = {
    createRequest: async () => {},
    stravaCallback: async () => ({ athleteId: 7, csrf: 'test-csrf' }),
    consent: async () => ({ management: 'test-management', code: 'test-code',
      data: { redirectUri: config.redirects[0], state: 'test-state' } }),
  };
  const app = createApp({ config: { ...config, ...overrides }, store, strava: {} });
  app.get('/proxy-client', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  const server = app.listen(0, '127.0.0.1');
  if (remoteAddress) server.on('connection', socket => Object.defineProperty(socket, 'remoteAddress', { value: remoteAddress }));
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path = '/health', headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { Host: 'mcp.example.com', Connection: 'close', ...headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { app, request };
}

test('local reverse proxy defaults reject HTTP and forwarded protocol chains', async t => {
  const { request } = await fixture(t);
  assert.equal((await request()).status, 400);
  assert.equal((await request('/health', { 'X-Forwarded-Proto': 'https' })).status, 200);
  for (const proto of ['http', 'https,http', 'https, http', 'http, https', 'https, https', ['https', 'https'], 'HTTPS']) {
    assert.equal((await request('/health', { 'X-Forwarded-Proto': proto })).status, 400);
  }
  const head = await request('/health', { 'X-Forwarded-Proto': 'https' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('untrusted remote client cannot spoof forwarded HTTPS', async t => {
  const { request } = await fixture(t, {}, '203.0.113.9');
  assert.equal((await request('/health', { 'X-Forwarded-Proto': 'https',
    'X-Forwarded-For': '127.0.0.1', 'Forwarded': 'proto=https' })).status, 400);
});

test('Azure explicitly trusts one ingress hop, not arbitrary forwarded chains', async t => {
  const { app, request } = await fixture(t, { trustedProxy: 1 }, '10.1.2.3');
  const trust = app.get('trust proxy fn');
  assert.equal(trust('10.1.2.3', 0), true);
  assert.equal(trust('203.0.113.9', 1), false);
  assert.equal((await request('/health', { 'X-Forwarded-Proto': 'https',
    'X-Forwarded-For': '127.0.0.1, 203.0.113.9' })).status, 200);
  const client = await request('/proxy-client', { 'X-Forwarded-Proto': 'https',
    'X-Forwarded-For': '127.0.0.1, 192.0.2.1, 203.0.113.9' });
  assert.deepEqual(JSON.parse(client.body), { ip: '203.0.113.9', ips: ['203.0.113.9'] });
  assert.equal((await request('/health', { 'X-Forwarded-Proto': ['https', 'https'] })).status, 400);
  assert.equal((await request()).status, 400);
  assert.equal((await request('/health', { 'X-Forwarded-Proto': 'https, http' })).status, 400);
  assert.equal((await request('/health', { Host: 'evil.example.com', 'X-Forwarded-Host': 'mcp.example.com',
    'X-Forwarded-Proto': 'https' })).status, 403);
  assert.equal((await request('/health', { 'X-Forwarded-Host': 'evil.example.com',
    'X-Forwarded-Proto': 'https' })).status, 200);
  assert.equal((await request('/health', { Host: 'mcp.example.com:443', 'X-Forwarded-Proto': 'https' })).status, 403);
  assert.equal((await request('/health', { Origin: 'https://evil.example.com', 'X-Forwarded-Proto': 'https' })).status, 403);
});

test('CIDR trust rejects remote spoofing outside configured ingress ranges', async t => {
  const trusted = await fixture(t, { trustedProxy: ['10.0.0.0/8'] }, '10.1.2.3');
  const untrusted = await fixture(t, { trustedProxy: ['10.0.0.0/8'] }, '203.0.113.9');
  assert.equal((await trusted.request('/health', { 'X-Forwarded-Proto': 'https' })).status, 200);
  assert.equal((await untrusted.request('/health', { 'X-Forwarded-Proto': 'https' })).status, 400);
});

test('OAuth cookies behind Azure HTTPS ingress remain Secure, HttpOnly and SameSite', async t => {
  const { request } = await fixture(t, { trustedProxy: 1 }, '10.1.2.3');
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirects[0],
    response_type: 'code', state: 'test-state', scope: 'runcoach:read',
    code_challenge: hash('test-verifier'), code_challenge_method: 'S256' });
  const authorize = await request('/oauth/authorize?' + params, { 'X-Forwarded-Proto': 'https' });
  assert.equal(authorize.status, 302);
  const browserCookie = authorize.headers['set-cookie'][0];
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(browserCookie.includes(attribute));
  const consent = await request('/oauth/consent', { 'X-Forwarded-Proto': 'https',
    Origin: config.publicUrl, Cookie: browserCookie.split(';')[0], 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST',
  new URLSearchParams({ request: 'test-request', csrf: 'test-csrf', decision: 'allow' }).toString());
  assert.equal(consent.status, 302);
  const managementCookie = consent.headers['set-cookie'].find(value => value.startsWith('mcp_management='));
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(managementCookie.includes(attribute));
});

test('consent HTML preserves browser form origins without exposing OAuth paths or queries', async t => {
  const { request } = await fixture(t, { trustedProxy: 1 }, '10.1.2.3');
  const params = new URLSearchParams({ state: 'test-request', code: 'test-code', scope: 'read,activity:read_all,profile:read_all' });
  const page = await request('/strava/callback?' + params, { 'X-Forwarded-Proto': 'https', Cookie: 'mcp_browser=test-browser' });
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('action="/oauth/consent"'));
  assert.equal(page.headers['referrer-policy'], 'strict-origin');
  assert.equal(page.headers['cache-control'], 'no-store');
  for (const origin of ['null', 'https://evil.example.com']) {
    const rejected = await request('/oauth/consent', { 'X-Forwarded-Proto': 'https', Origin: origin,
      Cookie: 'mcp_browser=test-browser', 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST',
    new URLSearchParams({ request: 'test-request', csrf: 'test-csrf', decision: 'allow' }).toString());
    assert.equal(rejected.status, 403);
    assert.equal(JSON.parse(rejected.body).error, 'untrusted_origin');
  }
});

test('development local HTTP remains usable without forwarded headers', async t => {
  const { request } = await fixture(t, { production: false });
  assert.equal((await request()).status, 200);
});
