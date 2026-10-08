import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { STRAVA_SCOPES } from '../src/config.js';
import { random, hash, SafeError } from '../src/store.js';

test('shared Strava authorization preserves RunCoach scopes and rejects deselection before exchange', async () => {
  assert.deepEqual(STRAVA_SCOPES, ['read', 'activity:read_all', 'profile:read_all']);
  const requests = new Map();
  let exchanges = 0;
  const store = {
    createRequest: async (state, browserHash, data) => requests.set(state, { browserHash, data }),
    stravaCallback: async (state, browserHash, exchange) => {
      const entry = requests.get(state);
      if (!entry || entry.browserHash !== browserHash) throw new SafeError('invalid_state');
      requests.delete(state);
      const identity = await exchange();
      return { ...entry.data, athleteId: identity.athleteId, csrf: random() };
    },
  };
  const config = { publicUrl: 'http://127.0.0.1', resource: 'http://127.0.0.1/mcp',
    production: false, origins: [], clientId: 'test-client', clientSecret: 'test-secret',
    redirects: ['https://chatgpt.com/callback'], stravaClientId: 'test-strava',
    stravaRedirect: 'http://127.0.0.1/strava/callback' };
  const strava = { authorize: async () => { exchanges++; return { athleteId: 7 }; } };
  const server = createApp({ config, store, strava }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  config.publicUrl = `http://127.0.0.1:${server.address().port}`;
  config.resource = config.publicUrl + '/mcp';
  config.stravaRedirect = config.publicUrl + '/strava/callback';
  const authorize = async () => {
    const response = await fetch(config.publicUrl + '/oauth/authorize?' + new URLSearchParams({
      client_id: config.clientId, redirect_uri: config.redirects[0], response_type: 'code',
      state: 'test-state', scope: 'runcoach:read', code_challenge: hash(random()),
      code_challenge_method: 'S256',
    }), { redirect: 'manual' });
    assert.equal(response.status, 302);
    const upstream = new URL(response.headers.get('location'));
    assert.equal(upstream.searchParams.get('scope'), STRAVA_SCOPES.join(','));
    return { state: upstream.searchParams.get('state'), cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  try {
    for (const scope of ['read', 'read,activity:read', 'read,activity:read_all', 'read,profile:read_all']) {
      const flow = await authorize();
      const response = await fetch(config.publicUrl + '/strava/callback?' + new URLSearchParams({
        state: flow.state, code: 'dummy-code', scope,
      }), { headers: { Cookie: flow.cookie } });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'strava_consent_required');
      assert.equal(exchanges, 0);
    }
    const flow = await authorize();
    const response = await fetch(config.publicUrl + '/strava/callback?' + new URLSearchParams({
      state: flow.state, code: 'dummy-code', scope: STRAVA_SCOPES.join(','),
    }), { headers: { Cookie: flow.cookie } });
    assert.equal(response.status, 200);
    assert.equal(exchanges, 1);
    assert.ok((await response.text()).includes('Denying below prevents ChatGPT access'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
