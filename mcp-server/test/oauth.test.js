import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { request as httpRequest } from 'node:http';
import { createApp } from '../src/app.js';
import { PgStore, random, hash } from '../src/store.js';
import { Strava } from '../src/strava.js';
import { STRAVA_SCOPES } from '../src/config.js';

test('OAuth/MCP HTTP and PostgreSQL transaction integration', { skip: !process.env.MCP_TEST_DATABASE_URL }, async t => {
  assert.ok(new URL(process.env.MCP_TEST_DATABASE_URL).pathname.endsWith('_test'), 'Use a dedicated database ending in _test; these tests clear the MCP schema');
  const pool = new pg.Pool({ connectionString: process.env.MCP_TEST_DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,strava_id BIGINT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,refresh_token TEXT NOT NULL,token_expires_at BIGINT NOT NULL,
    first_name TEXT,email TEXT,updated_at TIMESTAMP DEFAULT now()
  )`);
  await pool.query('TRUNCATE public.users');
  await pool.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  await pool.query('TRUNCATE runcoach_mcp.tokens,runcoach_mcp.grants,runcoach_mcp.authorization_requests,runcoach_mcp.connections');
  const store = new PgStore(pool);
  const config = { publicUrl: 'https://mcp.example.com', resource: 'https://mcp.example.com/mcp',
    production: false, origins: ['https://mcp.example.com'], clientId: 'test-client', clientSecret: 'test-secret',
    redirects: ['https://chatgpt.com/callback'], stravaClientId: 'test-strava',
    stravaRedirect: 'https://mcp.example.com/strava/callback' };
  let currentAthlete = 7, exchanges = 0;
  const strava = {
    authorize: async () => ({ athleteId: currentAthlete, credentials: { access_token: 'test-upstream-' + ++exchanges, refresh_token: 'test-refresh-' + exchanges, expires_at: Math.floor(Date.now() / 1000) + 3600 } }),
    get: async (id, path) => {
      assert.ok([7, 8].includes(id));
      return path === 'athlete/activities' ? [] : { id: 1, athlete: { id }, type: 'Run', start_date: new Date().toISOString() };
    },
  };
  const server = createApp({ config, store, strava }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { method: options.method || 'GET',
      headers: { Host: 'mcp.example.com', ...options.headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (const [key, values] of Object.entries(response.headers)) {
          for (const value of Array.isArray(values) ? values : [values]) if (value !== undefined) headers.append(key, value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers }));
      });
    });
    req.on('error', reject);
    req.end(options.body?.toString());
  });
  const post = (path, data, cookie) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(data) });
  const client = { client_id: config.clientId, client_secret: config.clientSecret };
  const authorize = async (changes = {}) => {
    const verifier = random() + random(), params = { client_id: config.clientId, redirect_uri: config.redirects[0],
      response_type: 'code', state: 'outer-client-state', scope: 'runcoach:read',
      code_challenge: hash(verifier), code_challenge_method: 'S256', resource: config.resource, ...changes };
    const response = await request('/oauth/authorize?' + new URLSearchParams(params));
    if (response.status !== 302) return { response };
    return { response, verifier, state: new URL(response.headers.get('location')).searchParams.get('state'),
      cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  const consent = async (decision = 'allow') => {
    const flow = await authorize();
    const callback = await request('/strava/callback?' + new URLSearchParams({ state: flow.state, code: 'dummy-code', scope: STRAVA_SCOPES.join(',') }), { headers: { Cookie: flow.cookie } });
    assert.equal(callback.status, 200);
    const body = await callback.text();
    const csrf = body.match(/name="csrf" value="([^"]+)"/)[1];
    const approved = await post('/oauth/consent', { request: flow.state, csrf, decision }, flow.cookie);
    assert.equal(approved.status, 302);
    return { ...flow, csrf, approved, code: new URL(approved.headers.get('location')).searchParams.get('code') };
  };
  const token = async flow => {
    const response = await post('/oauth/token', { ...client, grant_type: 'authorization_code', code: flow.code, redirect_uri: config.redirects[0], code_verifier: flow.verifier });
    assert.equal(response.status, 200); return response.json();
  };
  const mcp = (access, body) => request('/mcp', { method: 'POST', headers: {
    Authorization: ['Bearer', access].join(' '), Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  try {
    await t.test('metadata, untrusted origins, redirect and PKCE rejection', async () => {
      const metadata = await request('/.well-known/oauth-authorization-server');
      assert.deepEqual((await metadata.json()).code_challenge_methods_supported, ['S256']);
      assert.equal((await request('/health', { headers: { Host: 'evil.example.com' } })).status, 403);
      assert.equal((await request('/health', { headers: { Origin: 'https://evil.example.com' } })).status, 403);
      for (const changes of [{ redirect_uri: 'https://evil.example.com/cb' }, { scope: 'write' }, { resource: 'https://evil.example.com/mcp' },
        { code_challenge_method: 'plain' }, { state: '' }, { client_id: 'other-client' }]) assert.equal((await authorize(changes)).response.status, 400);
      const unauth = await request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(unauth.status, 401); assert.ok(unauth.headers.get('www-authenticate').includes('oauth-protected-resource/mcp'));
    });
    await t.test('browser/state/scope binding and one-time Strava callback', async () => {
      const flow = await authorize(), path = '/strava/callback?' + new URLSearchParams({ state: flow.state, code: 'dummy-code', scope: STRAVA_SCOPES.join(',') });
      assert.equal(new URL(flow.response.headers.get('location')).searchParams.get('scope'), STRAVA_SCOPES.join(','));
      assert.equal((await request(path)).status, 400);
      assert.equal((await request(path, { headers: { Cookie: 'mcp_browser=wrong' } })).status, 400);
      assert.equal((await request(path, { headers: { Cookie: flow.cookie } })).status, 200);
      assert.equal((await request(path, { headers: { Cookie: flow.cookie } })).status, 400);
      for (const scope of ['read', 'read,activity:read', 'read,activity:read_all', 'read,profile:read_all']) {
        const missing = await authorize(), before = exchanges;
        assert.equal((await request('/strava/callback?' + new URLSearchParams({ state: missing.state, code: 'dummy', scope }), { headers: { Cookie: missing.cookie } })).status, 400);
        assert.equal(exchanges, before, 'Deselected permissions must be rejected before token exchange');
      }
      const { rows } = await pool.query('SELECT data FROM runcoach_mcp.authorization_requests WHERE id=$1', [hash(flow.state)]);
      assert.equal((await post('/oauth/consent', { request: flow.state, csrf: 'wrong', decision: 'allow' }, flow.cookie)).status, 400);
      assert.equal(rows[0].data.athleteId, 7);
      await post('/oauth/consent', { request: flow.state, csrf: 'wrong', decision: 'allow' });
    });
    await t.test('denial creates no active grant but preserves latest shared tokens and profile', async () => {
      await pool.query("UPDATE public.users SET first_name='Existing Runner',email='private@example.invalid' WHERE strava_id=7");
      const flow = await consent('deny');
      const url = new URL(flow.approved.headers.get('location'));
      assert.equal(url.searchParams.get('error'), 'access_denied'); assert.equal(url.searchParams.get('state'), 'outer-client-state');
      assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.grants')).rows[0].count), 0);
      const user = (await pool.query('SELECT * FROM public.users WHERE strava_id=7')).rows[0];
      assert.equal(user.access_token, 'test-upstream-' + exchanges);
      assert.equal(user.first_name, 'Existing Runner');
      assert.equal(user.email, 'private@example.invalid');
    });
    let flow, tokens;
    await t.test('mandatory PKCE, client authentication, atomic code replay', async () => {
      flow = await consent();
      assert.equal((await post('/oauth/token', { ...client, grant_type: 'authorization_code', code: flow.code, redirect_uri: config.redirects[0], code_verifier: random() + random() })).status, 400);
      assert.equal((await post('/oauth/token', { ...client, client_secret: 'wrong', grant_type: 'authorization_code', code: flow.code, code_verifier: flow.verifier })).status, 401);
      const fields = { ...client, grant_type: 'authorization_code', code: flow.code, redirect_uri: config.redirects[0], code_verifier: flow.verifier };
      const responses = await Promise.all([post('/oauth/token', fields), post('/oauth/token', fields)]);
      assert.deepEqual(responses.map(x => x.status).sort(), [200, 400]);
      tokens = await responses.find(x => x.status === 200).json();
      assert.equal(tokens.scope, 'runcoach:read'); assert.equal(tokens.expires_in, 3600);
      assert.equal(JSON.stringify(tokens).includes('test-upstream'), false);
    });
    await t.test('authenticated stateless MCP initialize/list/call and strict arguments', async () => {
      const init = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'tests', version: '1' } } });
      assert.equal(init.status, 200); assert.equal((await init.json()).result.serverInfo.name, 'runcoach-strava-readonly');
      const listed = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
      assert.equal((await listed.json()).result.tools.length, 3);
      const called = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_recent_runs', arguments: {} } });
      assert.deepEqual((await called.json()).result.structuredContent.runs, []);
      const rejected = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_recent_runs', arguments: { athleteId: 8 } } });
      assert.equal((await rejected.json()).result.isError, true);
    });
    await t.test('refresh rotation/replay, invalid resource and client binding', async () => {
      assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: 'https://wrong.example.com/mcp' })).status, 400);
      await assert.rejects(store.exchange(tokens.refresh_token, 'refresh', 'different-client', () => true), /invalid_grant/);
      const response = await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
      assert.equal(response.status, 200);
      const rotated = await response.json(); assert.notEqual(rotated.refresh_token, tokens.refresh_token);
      assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status, 400);
      tokens = { ...rotated, old_access: tokens.access_token };
    });
    await t.test('revocation immediately invalidates old/current access and refresh', async () => {
      const response = await post('/oauth/revoke', { ...client, token: tokens.refresh_token });
      assert.equal(response.status, 200);
      for (const access of [tokens.access_token, tokens.old_access]) assert.equal((await mcp(access, {})).status, 401);
      assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status, 400);
      assert.equal((await request('/connections')).status, 401);
    });
    await t.test('management disconnect requires browser session and CSRF', async () => {
      const approved = await consent(), cookie = approved.approved.headers.getSetCookie().find(x => x.startsWith('mcp_management=')).split(';')[0];
      const current = await token(approved);
      assert.equal((await post('/connections', { csrf: 'wrong' }, cookie)).status, 400);
      const page = await request('/connections', { headers: { Cookie: cookie } });
      assert.equal(page.status, 200);
      const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)[1];
      assert.equal((await post('/connections', { csrf }, cookie)).status, 200);
      assert.equal((await mcp(current.access_token, {})).status, 401);
    });
    await t.test('expiry, scope and request timeouts deny access', async () => {
      const approved = await consent(), current = await token(approved);
      const grant = await store.authenticate(current.access_token);
      await pool.query("UPDATE runcoach_mcp.grants SET resource='https://another.example.com/mcp' WHERE id=$1", [grant.id]);
      assert.equal((await mcp(current.access_token, {})).status, 401);
      await assert.rejects(store.exchange(current.refresh_token, 'refresh', config.clientId, () => true, config.resource), /invalid_grant/);
      await pool.query('UPDATE runcoach_mcp.grants SET resource=$2 WHERE id=$1', [grant.id, config.resource]);
      await pool.query("UPDATE runcoach_mcp.grants SET scope='write' WHERE id=$1", [grant.id]);
      await assert.rejects(store.authenticate(current.access_token), /invalid_token/);
      await pool.query("UPDATE runcoach_mcp.grants SET scope='runcoach:read' WHERE id=$1", [grant.id]);
      await pool.query("UPDATE runcoach_mcp.tokens SET expires_at=now()-interval '1 second' WHERE hash=$1", [hash(current.access_token)]);
      await assert.rejects(store.authenticate(current.access_token), /invalid_token/);
      await pool.query("UPDATE runcoach_mcp.grants SET expires_at=now()-interval '1 second' WHERE id=$1", [grant.id]);
      assert.equal((await post('/oauth/token', { ...client, grant_type: 'refresh_token', refresh_token: current.refresh_token })).status, 400);
      const expired = await authorize();
      await pool.query("UPDATE runcoach_mcp.authorization_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [hash(expired.state)]);
      assert.equal((await request('/strava/callback?' + new URLSearchParams({ state: expired.state, code: 'dummy', scope: STRAVA_SCOPES.join(',') }), { headers: { Cookie: expired.cookie } })).status, 400);
    });
    await t.test('SQL locks serialize upstream token refresh, rollback preserves credentials', async () => {
      await pool.query('INSERT INTO runcoach_mcp.connections (athlete_id) VALUES ($1) ON CONFLICT (athlete_id) DO NOTHING', [99]);
      await pool.query('INSERT INTO public.users (strava_id,access_token,refresh_token,token_expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (strava_id) DO UPDATE SET access_token=$2,refresh_token=$3,token_expires_at=$4',
        [99, 'old', 'old-refresh', 1]);
      let count = 0;
      const api = new Strava(config, store, async () => {
        count++; await new Promise(resolve => setTimeout(resolve, 20));
        return Response.json({ access_token: 'rotated', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      });
      assert.deepEqual(await Promise.all([api.access(99), api.access(99)]), ['rotated', 'rotated']); assert.equal(count, 1);
      const before = (await pool.query('SELECT access_token,refresh_token,token_expires_at FROM public.users WHERE strava_id=99')).rows[0];
      const fail = new Strava(config, store, async () => new Response('secret', { status: 500 }));
      await assert.rejects(fail.access(99, true), /strava_unavailable/);
      const after = (await pool.query('SELECT access_token,refresh_token,token_expires_at FROM public.users WHERE strava_id=99')).rows[0];
      assert.deepEqual(after, before); assert.equal(after.refresh_token, 'new-refresh');
      const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='runcoach_mcp' AND table_name='connections'");
      assert.deepEqual(columns.rows.map(row => row.column_name).sort(), ['athlete_id', 'updated_at']);
      const backend = await pool.connect();
      try {
        await backend.query('BEGIN');
        await backend.query('SELECT id FROM public.users WHERE strava_id=99 FOR UPDATE');
        const waiting = api.access(99);
        await backend.query('UPDATE public.users SET access_token=$1,refresh_token=$2,token_expires_at=$3 WHERE strava_id=99',
          ['backend-new', 'backend-refresh', Math.floor(Date.now() / 1000) + 3600]);
        await backend.query('COMMIT');
        assert.equal(await waiting, 'backend-new'); assert.equal(count, 1);
      } finally { backend.release(); }
    });
    await t.test('callback exchange locks before rotation and publishes before backend reads', async () => {
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      const publishing = store.authorizeCredentials(async () => {
        entered(); await gate;
        return { athleteId: 99, credentials: { access_token: 'callback-latest', refresh_token: 'callback-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 } };
      });
      await started;
      const backend = await pool.connect();
      try {
        await backend.query('BEGIN');
        let read = false;
        const waiting = backend.query('SELECT access_token FROM public.users WHERE strava_id=99 FOR UPDATE').then(result => { read = true; return result; });
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(read, false);
        release(); await publishing;
        assert.equal((await waiting).rows[0].access_token, 'callback-latest');
        await backend.query('COMMIT');
      } finally { release(); await backend.query('ROLLBACK'); backend.release(); }
    });
    await t.test('concurrent refresh, management revocation, and cleanup use grant-before-token locks', async () => {
      for (let i = 0; i < 25; i++) {
        const grantId = random(), refresh = random(), management = random(), expiredAccess = random();
        await pool.query(`INSERT INTO runcoach_mcp.grants (id,athlete_id,client_id,resource,scope,expires_at)
          VALUES ($1,7,$2,$3,'runcoach:read',now()+interval '30 days')`, [grantId, config.clientId, config.resource]);
        await store.insertToken(pool, refresh, grantId, 'refresh', 3600_000);
        await store.insertToken(pool, management, grantId, 'management', 1800_000);
        await store.insertToken(pool, expiredAccess, grantId, 'access', -1000);
        const results = await Promise.allSettled([
          store.exchange(refresh, 'refresh', config.clientId, () => true, config.resource),
          store.revoke(management, config.clientId, 'management'),
          store.cleanup(),
        ]);
        assert.equal(results[1].status, 'fulfilled', 'Disconnect must not encounter a deadlock');
        assert.equal(results[2].status, 'fulfilled', 'Cleanup must not encounter a deadlock');
        if (results[0].status === 'rejected') assert.equal(results[0].reason.code, 'invalid_grant');
        else {
          await assert.rejects(store.authenticate(results[0].value.access_token), /invalid_token/);
          await assert.rejects(store.exchange(results[0].value.refresh_token, 'refresh', config.clientId, () => true, config.resource), /invalid_grant/);
        }
        const row = (await pool.query('SELECT revoked FROM runcoach_mcp.grants WHERE id=$1', [grantId])).rows[0];
        assert.ok(!row || row.revoked);
        assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.tokens WHERE grant_id=$1', [grantId])).rows[0].count), 0);
      }
    });
    await t.test('grants isolate identities and revoke deletes only unused credentials', async () => {
      await pool.query('TRUNCATE runcoach_mcp.tokens,runcoach_mcp.grants,runcoach_mcp.authorization_requests,runcoach_mcp.connections');
      const first = await consent(), firstTokens = await token(first);
      const second = await consent(), secondTokens = await token(second);
      await store.revoke(firstTokens.access_token, config.clientId);
      assert.equal((await store.authenticate(secondTokens.access_token)).athlete_id, '7');
      assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.connections')).rows[0].count), 1);
      await store.revoke(secondTokens.refresh_token, config.clientId);
      assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.connections')).rows[0].count), 0);
      currentAthlete = 8;
      const other = await consent(), otherTokens = await token(other);
      currentAthlete = 7;
      const original = await consent(), originalTokens = await token(original);
      assert.equal((await store.authenticate(otherTokens.access_token)).athlete_id, '8');
      assert.equal((await store.authenticate(originalTokens.access_token)).athlete_id, '7');
      await store.revoke(originalTokens.access_token, config.clientId);
      assert.equal((await store.authenticate(otherTokens.access_token)).athlete_id, '8');
      assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.connections WHERE athlete_id=8')).rows[0].count), 1);
    });
    await t.test('production HTTP requires trusted loopback TLS proxy indication', async () => {
      config.production = true;
      assert.equal((await request('/health')).status, 400);
      assert.equal((await request('/health', { headers: { 'X-Forwarded-Proto': 'https' } })).status, 200);
      config.production = false;
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); await pool.end();
  }
});
