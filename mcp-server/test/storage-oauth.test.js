import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { STRAVA_SCOPES } from '../src/config.js';
import { PgStore, hash, random } from '../src/store.js';
import { migrate } from '../src/migrate.js';

test('standalone HTTP OAuth, real Strava adapter, MCP tools and durable restart', {
  skip: !process.env.MCP_STANDALONE_TEST_DATABASE_URL,
}, async t => {
  const databaseUrl = new URL(process.env.MCP_STANDALONE_TEST_DATABASE_URL);
  assert.ok(databaseUrl.pathname.endsWith('_test'), 'Use a dedicated standalone HTTP database ending in _test');
  const config = {
    publicUrl: 'https://mcp.example.com', resource: 'https://mcp.example.com/mcp',
    production: false, origins: ['https://mcp.example.com'],
    clientId: 'synthetic-client', clientSecret: 'synthetic-client-secret',
    redirects: ['https://chatgpt.com/callback'], stravaClientId: 'independent-synthetic-strava',
    stravaClientSecret: 'synthetic-strava-secret', stravaRedirect: 'https://mcp.example.com/strava/callback',
    storageMode: 'standalone', credentialEncryptionKey: randomBytes(32),
  };
  const athletes = new Map(), calls = [];
  let sequence = 0;
  const issue = athleteId => {
    const credentials = {
      access_token: `synthetic-access-${athleteId}-${++sequence}`,
      refresh_token: `synthetic-refresh-${athleteId}-${sequence}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    athletes.set(athleteId, credentials);
    return credentials;
  };
  const activity = athleteId => ({
    id: athleteId * 100 + 1, athlete: { id: athleteId }, type: 'Run',
    name: `Runner ${athleteId} easy run`, start_date: new Date(Date.now() - 3600_000).toISOString(),
    distance: athleteId * 1000, moving_time: 2400, average_speed: 3,
    description: 'private-description-must-not-leak', map: { summary_polyline: 'private-GPS-must-not-leak' },
    splits_metric: [{ split: 1, distance: 1000, moving_time: 330, average_speed: 3, private_field: 'private-split-field' }],
  });
  const fetchImpl = async (rawUrl, request = {}) => {
    const url = new URL(rawUrl);
    assert.equal(url.origin, 'https://www.strava.com', 'Synthetic adapter never contacts a real service');
    calls.push({ path: url.pathname, method: request.method || 'GET' });
    if (url.pathname === '/oauth/token') {
      assert.equal(request.method, 'POST');
      const fields = new URLSearchParams(request.body);
      assert.equal(fields.get('client_id'), config.stravaClientId);
      assert.equal(fields.get('client_secret'), config.stravaClientSecret);
      if (fields.get('grant_type') === 'authorization_code') {
        const athleteId = Number(fields.get('code').replace('account-', ''));
        assert.ok([7, 8].includes(athleteId));
        return Response.json({ ...issue(athleteId), athlete: { id: athleteId } });
      }
      assert.equal(fields.get('grant_type'), 'refresh_token');
      const entry = [...athletes].find(([, credentials]) => credentials.refresh_token === fields.get('refresh_token'));
      if (!entry) return Response.json({ error: 'invalid_refresh' }, { status: 401 });
      return Response.json(issue(entry[0]));
    }
    assert.equal(request.method || 'GET', 'GET', 'All Strava resource operations must be read-only');
    const entry = [...athletes].find(([, credentials]) => request.headers?.Authorization === ['Bearer', credentials.access_token].join(' '));
    if (!entry) return Response.json({ error: 'expired_access' }, { status: 401 });
    if (url.pathname === '/api/v3/athlete/activities') {
      assert.ok(Number(url.searchParams.get('after')) > 0);
      return Response.json([activity(entry[0])]);
    }
    const detail = /^\/api\/v3\/activities\/(701|801)$/.exec(url.pathname);
    assert.ok(detail, 'No unsupported upstream endpoints');
    return Response.json(activity(Math.floor(Number(detail[1]) / 100)));
  };
  let pool, store, server, base;
  const start = async () => {
    pool = new pg.Pool({ connectionString: databaseUrl.href });
    await migrate(pool, config);
    store = new PgStore(pool, config);
    await store.initialize();
    server = createApp({ config, store, fetchImpl }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    server = undefined; pool = undefined;
  };
  t.after(stop);
  const setup = new pg.Pool({ connectionString: databaseUrl.href });
  try {
    assert.equal((await setup.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null,
      'This standalone HTTP suite must use a separate database without application tables');
    await setup.query('DROP SCHEMA IF EXISTS runcoach_mcp CASCADE');
  } finally { await setup.end(); }
  await start();
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, {
      method: options.method || 'GET', headers: { Host: 'mcp.example.com', ...options.headers },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers }));
      });
    });
    req.on('error', reject);
    req.end(options.body?.toString());
  });
  const post = (path, fields, cookie) => request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(fields),
  });
  const client = { client_id: config.clientId, client_secret: config.clientSecret };
  const authorize = async athleteId => {
    const verifier = random() + random();
    const response = await request('/oauth/authorize?' + new URLSearchParams({
      client_id: config.clientId, response_type: 'code', redirect_uri: config.redirects[0], state: 'synthetic-outer-state',
      scope: 'runcoach:read', resource: config.resource, code_challenge: hash(verifier), code_challenge_method: 'S256',
    }));
    assert.equal(response.status, 302);
    const upstream = new URL(response.headers.get('location'));
    assert.equal(upstream.searchParams.get('client_id'), config.stravaClientId);
    assert.equal(upstream.searchParams.get('scope'), STRAVA_SCOPES.join(','));
    const state = upstream.searchParams.get('state'), cookie = response.headers.get('set-cookie').split(';')[0];
    const callback = await request('/strava/callback?' + new URLSearchParams({
      state, code: `account-${athleteId}`, scope: STRAVA_SCOPES.join(','),
    }), { headers: { Cookie: cookie } });
    assert.equal(callback.status, 200);
    const page = await callback.text();
    assert.ok(page.includes('stored separately from RunCoach'));
    assert.equal(page.includes('synthetic-access'), false);
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    const approved = await post('/oauth/consent', { request: state, csrf, decision: 'allow' }, cookie);
    assert.equal(approved.status, 302);
    const callbackUrl = new URL(approved.headers.get('location'));
    assert.equal(callbackUrl.searchParams.get('state'), 'synthetic-outer-state');
    return { code: callbackUrl.searchParams.get('code'), verifier };
  };
  const token = flow => post('/oauth/token', {
    ...client, grant_type: 'authorization_code', code: flow.code, redirect_uri: config.redirects[0],
    code_verifier: flow.verifier, resource: config.resource,
  });
  const mcp = (access, body) => request('/mcp', {
    method: 'POST', headers: { Authorization: ['Bearer', access].join(' '), Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const tool = (access, name, args = {}) => mcp(access, {
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args },
  });
  const content = async response => {
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(JSON.stringify(json).includes('synthetic-access'), false);
    assert.equal(JSON.stringify(json).includes('synthetic-refresh'), false);
    assert.equal(JSON.stringify(json).includes('private-'), false);
    return json.result;
  };
  let first, second;
  await t.test('authorization, consent and mandatory PKCE issue independently bound tokens for two runners', async () => {
    const flow = await authorize(7);
    assert.equal((await token({ ...flow, verifier: random() + random() })).status, 400);
    const issued = await token(flow);
    assert.equal(issued.status, 200);
    first = await issued.json();
    assert.equal((await token(flow)).status, 400, 'Authorization codes are single use');
    const other = await token(await authorize(8));
    assert.equal(other.status, 200);
    second = await other.json();
    assert.notEqual(first.access_token, second.access_token);
    assert.equal(first.scope, 'runcoach:read');
    const rows = (await pool.query('SELECT athlete_id,encrypted_credentials FROM runcoach_mcp.credentials ORDER BY athlete_id')).rows;
    assert.deepEqual(rows.map(row => row.athlete_id), ['7', '8']);
    for (const row of rows) assert.equal(row.encrypted_credentials.includes(Buffer.from('synthetic-')), false);
  });
  await t.test('MCP initialize and recent/details tools use the real adapter with redaction and ownership checks', async () => {
    const initialized = await mcp(first.access_token, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'standalone-tests', version: '1' } },
    });
    assert.equal(initialized.status, 200);
    assert.equal((await initialized.json()).result.serverInfo.name, 'runcoach-strava-readonly');
    for (const [tokens, athleteId] of [[first, 7], [second, 8]]) {
      const recent = await content(await tool(tokens.access_token, 'get_recent_runs'));
      assert.equal(recent.structuredContent.runs[0].activity_id, athleteId * 100 + 1);
      const detail = await content(await tool(tokens.access_token, 'get_run_details', { activity_id: athleteId * 100 + 1 }));
      assert.equal(detail.structuredContent.run.distance, athleteId * 1000);
      assert.equal(detail.structuredContent.splits_metric.length, 1);
    }
    const forbidden = await content(await tool(first.access_token, 'get_run_details', { activity_id: 801 }));
    assert.equal(forbidden.isError, true);
    assert.equal(forbidden.structuredContent.error, 'activity_not_owned');
  });
  await t.test('restart preserves grants and encrypted credentials; simultaneous calls rotate Strava credentials once', async () => {
    await stop();
    await start();
    assert.equal((await content(await tool(second.access_token, 'get_recent_runs'))).structuredContent.runs[0].activity_id, 801);
    await store.credentials(7, async credentials => ({ credentials: { ...credentials, expires_at: 1 }, value: true }));
    const before = calls.filter(call => call.path === '/oauth/token').length;
    const results = await Promise.all([
      tool(first.access_token, 'get_recent_runs'), tool(first.access_token, 'get_run_details', { activity_id: 701 }),
    ]);
    for (const response of results) assert.equal((await content(response)).isError, undefined);
    assert.equal(calls.filter(call => call.path === '/oauth/token').length - before, 1);
    assert.equal(await store.credentials(7, async credentials => ({ value: credentials.refresh_token })), athletes.get(7).refresh_token);
  });
  await t.test('HTTP MCP refresh rotates once; revocation survives restart without affecting the other account', async () => {
    const response = await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: first.refresh_token });
    assert.equal(response.status, 200);
    const rotated = await response.json();
    assert.notEqual(rotated.refresh_token, first.refresh_token);
    assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: first.refresh_token })).status, 400);
    assert.equal((await tool(rotated.access_token, 'get_recent_runs')).status, 200);
    assert.equal((await post('/oauth/revoke', { ...client, token: rotated.refresh_token })).status, 200);
    await stop();
    await start();
    for (const access of [first.access_token, rotated.access_token]) assert.equal((await tool(access, 'get_recent_runs')).status, 401);
    assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: rotated.refresh_token })).status, 400);
    assert.equal((await content(await tool(second.access_token, 'get_run_details', { activity_id: 801 }))).structuredContent.run.activity_id, 801);
    assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null);
    assert.ok(calls.some(call => call.path === '/api/v3/athlete/activities'));
    assert.ok(calls.some(call => call.path === '/api/v3/activities/701'));
    assert.ok(calls.some(call => call.path === '/api/v3/activities/801'));
  });
});
