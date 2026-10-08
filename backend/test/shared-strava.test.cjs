const test = require('node:test');
const assert = require('node:assert/strict');
const { registerHooks } = require('node:module');

const calls = [];
let row;
let response;
let failUpsert = false;
const client = {
  async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT')) return { rows: row ? [row] : [] };
    return { rows: [] };
  },
  release() { calls.push({ sql: 'RELEASE' }); },
};
const database = { async getClient() { return client; }, async query() { throw new Error('Nontransactional query'); } };
const axios = { async post() {
  calls.push({ sql: 'STRAVA_REFRESH' });
  if (response instanceof Error) throw response;
  return { data: response };
} };
const users = { async upsertUser(user, execute) {
  await execute('UPSERT');
  if (failUpsert) throw new Error('Upsert failed');
  return { ...user, id: 1 };
} };
globalThis.sharedStravaFixtures = { database, axios, users };
const hooks = registerHooks({
  load(url, context, next) {
    let source;
    if (url.endsWith('/dist/config/database.js')) source = 'module.exports = globalThis.sharedStravaFixtures.database;';
    if (url.endsWith('/dist/models/User.js')) source = 'module.exports = globalThis.sharedStravaFixtures.users;';
    if (url.includes('/node_modules/axios/')) source = 'module.exports = globalThis.sharedStravaFixtures.axios;';
    if (url.endsWith('/dist/config/strava.js')) source = 'module.exports = { stravaConfig: { tokenUrl: "https://strava.example/token" } };';
    if (url.endsWith('/dist/utils/logger.js')) source = 'module.exports = { info() {}, warn() {}, error() {} };';
    if (url.endsWith('/dist/utils/jwt.js')) source = 'module.exports = { generateToken() { return "test-jwt"; } };';
    return source ? { format: 'commonjs', source, shortCircuit: true } : next(url, context);
  },
});
const service = require('../dist/services/stravaService.js');
const controller = require('../dist/controllers/authController.js');
hooks.deregister();

test.beforeEach(() => {
  calls.length = 0;
  row = { access_token: 'old-access', refresh_token: 'old-refresh', token_expires_at: 0 };
  response = { access_token: 'new-access', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 7200 };
  failUpsert = false;
  process.env.MCP_CALLBACK_ORIGIN = 'https://mcp.example.com';
  process.env.FRONTEND_URL = 'https://runcoach.example.com';
});

test('refresh holds the shared row lock through upstream rotation and persistence', async () => {
  assert.equal(await service.refreshStravaToken(1), 'new-access');
  const sql = calls.map(x => x.sql);
  assert.equal(sql[0], 'BEGIN');
  assert.match(sql[1], /FROM public\.users .* FOR UPDATE$/);
  assert.equal(sql[2], 'STRAVA_REFRESH');
  assert.match(sql[3], /^UPDATE public\.users SET access_token/);
  assert.deepEqual(calls[3].values.slice(0, 2), ['new-access', 'new-refresh']);
  assert.deepEqual(sql.slice(4), ['COMMIT', 'RELEASE']);
});

test('valid shared tokens commit without contacting Strava', async () => {
  row.token_expires_at = Math.floor(Date.now() / 1000) + 7200;
  assert.equal(await service.refreshStravaToken(1), 'old-access');
  assert.deepEqual(calls.map(x => x.sql).slice(2), ['COMMIT', 'RELEASE']);
});

test('missing users, upstream failures and malformed tokens roll back and release', async () => {
  for (const failure of [null, new Error('Upstream failed'), { access_token: 'invalid' }]) {
    calls.length = 0;
    row = failure === null ? null : { refresh_token: 'old-refresh', token_expires_at: 0 };
    response = failure;
    await assert.rejects(service.refreshStravaToken(1));
    assert.deepEqual(calls.map(x => x.sql).slice(-2), ['ROLLBACK', 'RELEASE']);
    assert.ok(!calls.some(x => x.sql.startsWith('UPDATE')));
  }
});

function result() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; },
    json(body) { this.body = body; return this; }, redirect(url) { this.url = url; } };
}

test('existing login callback holds the shared table lock and upserts in its transaction', async () => {
  response.athlete = { id: 23 };
  const res = result();
  await controller.handleCallback({ query: { code: 'code' } }, res);
  const sql = calls.map(x => x.sql);
  assert.deepEqual(sql.slice(0, 3), ['BEGIN', "SET LOCAL lock_timeout = '5s'", 'LOCK TABLE public.users IN EXCLUSIVE MODE']);
  assert.deepEqual(sql.slice(3), ['STRAVA_REFRESH', 'UPSERT', 'COMMIT', 'RELEASE']);
  assert.equal(res.url, 'https://runcoach.example.com/callback?token=test-jwt');
  calls.length = 0;
  failUpsert = true;
  await controller.handleCallback({ query: { code: 'code' } }, result());
  assert.deepEqual(calls.map(x => x.sql).slice(-2), ['ROLLBACK', 'RELEASE']);
});

test('relay preserves approved OAuth fields, ignores redirect overrides and redacts logging', () => {
  const req = { query: { state: 's'.repeat(43), code: 'a&b', scope: 'read,activity:read_all',
    redirect_uri: 'https://attacker.example' }, baseUrl: '/api/v1/auth',
    path: '/strava/mcp/callback', originalUrl: '/callback?code=secret' };
  const res = result();
  controller.relayMcpCallback(req, res);
  const url = new URL(res.url);
  assert.equal(url.origin, 'https://mcp.example.com');
  assert.equal(url.pathname, '/strava/callback');
  assert.equal(url.searchParams.get('code'), 'a&b');
  assert.equal(url.searchParams.get('state'), 's'.repeat(43));
  assert.equal(url.searchParams.has('redirect_uri'), false);
  assert.equal(req.originalUrl, '/api/v1/auth/strava/mcp/callback');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(calls.length, 0, 'Relay must not exchange or write tokens');
});

test('relay rejects malformed callbacks and unsafe or absent configured origins', () => {
  for (const query of [{}, { state: 'short', code: 'code' },
    { state: 's'.repeat(43), code: ['one', 'two'] },
    { state: 's'.repeat(43), code: 'c'.repeat(1025) }]) {
    const res = result();
    controller.relayMcpCallback({ query, baseUrl: '', path: '/callback' }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.url, undefined);
  }
  for (const origin of ['', 'http://mcp.example.com', 'https://mcp.example.com/path', 'https://user@mcp.example.com']) {
    process.env.MCP_CALLBACK_ORIGIN = origin;
    const res = result();
    controller.relayMcpCallback({ query: {}, baseUrl: '', path: '/callback' }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.url, undefined);
  }
});
