import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, inputs, safeRun } from '../src/tools.js';
import { Strava } from '../src/strava.js';
import { loadConfig } from '../src/config.js';
import { BoundedRateStore } from '../src/app.js';

const date = new Date('2026-10-08T08:00:00Z');
const clock = () => date;
const grant = { athlete_id: '7' };
const run = { id: 42, athlete: { id: 7 }, sport_type: 'Run', name: 'Morning <run>', start_date: '2026-10-07T10:00:00Z',
  distance: 10000, moving_time: 3000, average_speed: 3.33, description: 'private', map: { summary_polyline: 'gps' }, gear_id: 'secret',
  splits_metric: [{ split: 1, distance: 1000, moving_time: 300, hidden: 'private' }] };
const upstream = value => ({ get: async (athlete, path) => { assert.equal(athlete, 7); assert.ok(path); return value; } });

test('strict input bounds reject identities, unsafe ids, and runaway requests', () => {
  for (const [name, args] of [
    ['get_recent_runs', { userId: 2 }], ['get_recent_runs', { athleteId: 7 }],
    ['get_recent_runs', { days: 366 }], ['get_recent_runs', { days: 0 }], ['get_recent_runs', { days: 184.5 }],
    ['get_recent_runs', { per_page: 51 }], ['get_recent_runs', { page: 0 }], ['get_recent_runs', { page: 101 }],
    ['get_run_details', { activity_id: Number.MAX_SAFE_INTEGER + 1 }], ['get_run_details', { activity_id: 1, split_limit: 101 }],
    ['get_weekly_summary', { weeks: 53 }], ['get_weekly_summary', { weeks: 0 }], ['get_weekly_summary', { weeks: 27.5 }],
  ]) assert.equal(inputs[name].safeParse(args).success, false);
});
test('historical windows accept six months and maximum bounds without changing defaults', () => {
  for (const days of [91, 184, 365]) assert.equal(inputs.get_recent_runs.parse({ days }).days, days);
  for (const weeks of [13, 28, 52]) assert.equal(inputs.get_weekly_summary.parse({ weeks }).weeks, weeks);
  assert.deepEqual(inputs.get_recent_runs.parse({}), { days: 30, page: 1, per_page: 20 });
  assert.deepEqual(inputs.get_weekly_summary.parse({}), { weeks: 4 });
});
test('six-month run listing retrieves older runs after an empty all-sport page', async () => {
  const after = Math.floor(date.getTime() / 1000 - 184 * 86400);
  const older = { ...run, id: 43, start_date: '2026-04-15T10:00:00Z' };
  const requests = [];
  const api = { get: async (athlete, path, params) => {
    assert.equal(athlete, 7); assert.equal(path, 'athlete/activities');
    assert.equal(params.after, after); assert.equal(params.per_page, 2);
    requests.push(params.page);
    return params.page === 1 ? [{ ...run, sport_type: 'Ride' }, { ...run, sport_type: 'Swim' }] :
      [older, { ...run, id: 44, start_date: new Date(after * 1000).toISOString() }];
  } };
  const first = await callTool('get_recent_runs', { days: 184, per_page: 2 }, grant, api, clock);
  assert.deepEqual(first.runs, []); assert.equal(first.next_page, 2);
  const second = await callTool('get_recent_runs', { days: 184, per_page: 2, page: first.next_page }, grant, api, clock);
  assert.deepEqual(second.runs.map(a => a.activity_id), [43]);
  assert.deepEqual(requests, [1, 2]);
  const exhausted = await callTool('get_recent_runs', { days: 365, page: 100, per_page: 1 }, grant, upstream([older]), clock);
  assert.equal(exhausted.has_more, true); assert.equal(exhausted.next_page, null);
});
test('details enforce ownership before returning data and require run sports', async () => {
  await assert.rejects(callTool('get_run_details', { activity_id: 42 }, grant, upstream({ ...run, athlete: { id: 8 } }), clock), /activity_not_owned/);
  await assert.rejects(callTool('get_run_details', { activity_id: 42 }, grant, upstream({ ...run, sport_type: 'Ride' }), clock), /not_a_run/);
  const result = await callTool('get_run_details', { activity_id: 42 }, grant, upstream(run), clock);
  assert.deepEqual(result.splits_metric, [{ split: 1, distance: 1000, moving_time: 300 }]);
  assert.equal(result.fetched_at, date.toISOString());
  for (const privateField of ['description', 'gps', 'gear_id', 'athlete', 'private']) assert.equal(JSON.stringify(result).includes(privateField), false);
  assert.equal(safeRun({ ...run, name: 'x'.repeat(500) }).title.length, 200);
});
test('recent runs filter sports/future dates; pagination applies to all activities', async () => {
  const result = await callTool('get_recent_runs', { per_page: 3 }, grant, upstream([run, { ...run, sport_type: 'Ride' }, { ...run, start_date: '2027-01-01' }]), clock);
  assert.equal(result.runs.length, 1);
  assert.equal(result.has_more, true);
  assert.equal(result.next_page, 2);
  assert.equal(result.pagination_applies_to, 'all_sports');
});
test('splits are bounded and paginated', async () => {
  const activity = { ...run, splits_metric: Array.from({ length: 120 }, (_, i) => ({ split: i + 1, distance: 1000, map: 'private' })) };
  const first = await callTool('get_run_details', { activity_id: 42 }, grant, upstream(activity), clock);
  assert.equal(first.splits_metric.length, 100); assert.equal(first.next_split_offset, 100);
  const last = await callTool('get_run_details', { activity_id: 42, split_offset: 100 }, grant, upstream(activity), clock);
  assert.equal(last.splits_metric.length, 20); assert.equal(last.next_split_offset, null);
});
test('weekly aggregation uses UTC Monday, deduplicates and reports truncation', async () => {
  let calls = 0;
  const api = { get: async () => { calls++; return Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 1 })); } };
  const result = await callTool('get_weekly_summary', { weeks: 2 }, grant, api, clock);
  assert.equal(calls, 10); assert.equal(result.partial, true); assert.equal(result.truncated, true);
  assert.equal(result.weeks[1].week_start, '2026-10-05'); assert.equal(result.weeks[1].runs, 100);
  assert.equal(result.weeks[1].distance_meters, 1_000_000);
  const complete = await callTool('get_weekly_summary', { weeks: 1 }, grant, upstream([run]), clock);
  assert.equal(complete.partial, false); assert.equal(complete.current_week_incomplete, true);
});
test('six-month summaries include April-June runs across pages and retain empty weeks', async () => {
  const start = new Date('2026-03-30T00:00:00Z');
  const april = { ...run, id: 43, start_date: '2026-04-15T10:00:00Z' };
  const june = { ...run, id: 44, start_date: '2026-06-15T10:00:00Z' };
  let calls = 0;
  const api = { get: async (athlete, path, params) => {
    assert.equal(athlete, 7); assert.equal(path, 'athlete/activities');
    assert.equal(params.after, start.getTime() / 1000 - 1);
    assert.equal(params.before, date.getTime() / 1000 + 1);
    assert.equal(params.per_page, 100); assert.equal(params.page, ++calls);
    return params.page === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 100, sport_type: 'Ride' })) :
      [run, april, june, april, { ...april, id: 45, start_date: '2026-03-29T23:59:59Z' },
        { ...run, id: 46, start_date: '2026-10-08T08:00:01Z' }];
  } };
  const result = await callTool('get_weekly_summary', { weeks: 28 }, grant, api, clock);
  assert.equal(result.weeks.length, 28); assert.equal(result.weeks[0].week_start, '2026-03-30');
  for (const weekStart of ['2026-04-13', '2026-06-15', '2026-10-05']) {
    const week = result.weeks.find(w => w.week_start === weekStart);
    assert.equal(week.runs, 1); assert.equal(week.distance_meters, 10000);
    assert.equal(week.moving_time_seconds, 3000);
  }
  assert.equal(result.weeks[0].runs, 0);
  assert.equal(result.weeks.reduce((sum, w) => sum + w.runs, 0), 3);
  assert.equal(result.upstream_pages, 2); assert.equal(result.partial, false);
  assert.equal(result.truncated, false); assert.equal(result.current_week_incomplete, true);
  assert.equal(result.timezone, 'UTC'); assert.equal(result.week_starts_on, 'Monday');
});
test('maximum weekly window preserves response and upstream retrieval bounds', async () => {
  let calls = 0;
  const api = { get: async () => { calls++; return Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 1 })); } };
  const result = await callTool('get_weekly_summary', { weeks: 52 }, grant, api, clock);
  assert.equal(result.weeks.length, 52); assert.equal(result.weeks[0].week_start, '2025-10-13');
  assert.equal(calls, 10); assert.equal(result.upstream_pages, 10);
  assert.equal(result.max_activities, 1000); assert.equal(result.partial, true); assert.equal(result.truncated, true);
});
test('28 weekly buckets cover six calendar months even at the start of Monday', async () => {
  const monday = new Date('2026-10-05T00:00:00Z');
  const boundaryRun = { ...run, start_date: '2026-04-05T10:00:00Z' };
  const result = await callTool('get_weekly_summary', { weeks: 28 }, grant, upstream([boundaryRun]), () => monday);
  assert.equal(result.weeks[0].week_start, '2026-03-30');
  assert.equal(result.weeks[0].runs, 1);
  assert.equal(result.partial, false);
});
test('Strava errors redact upstream bodies and forward bounded Retry-After', async () => {
  const api = new Strava({}, {}, async () => new Response('private token body', { status: 429, headers: { 'Retry-After': '120' } }));
  await assert.rejects(api.request('https://www.strava.com/api/v3/athlete'), error => error.code === 'strava_rate_limited' && error.retryAfter === '120' && !error.message.includes('private'));
  api.fetch = async () => { throw new Error('secret network url'); };
  await assert.rejects(api.request('https://www.strava.com/api/v3/athlete'), /strava_unavailable/);
});
test('Strava refresh threshold is five minutes and preserves rotation', async () => {
  const config = { stravaClientId: 'dummy', stravaClientSecret: 'dummy' };
  let record = { access_token: 'old', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 2000 }, calls = 0;
  const store = { credentials: async (_id, fn) => { const result = await fn(record); if (result.credentials) record = result.credentials; return result.value; } };
  const api = new Strava(config, store, async (_url, options) => {
    calls++; assert.equal(options.body.get('refresh_token'), 'old-refresh');
    return Response.json({ access_token: 'new', refresh_token: 'rotated-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  });
  assert.equal(await api.access(7), 'old'); assert.equal(calls, 0);
  record = { access_token: 'old', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 200 };
  assert.equal(await api.access(7), 'new'); assert.equal(calls, 1);
  assert.equal(record.refresh_token, 'rotated-refresh');
});
test('Strava authorization trusts validated token-response identity and never fetches /athlete', async () => {
  const requested = [];
  const credentials = { access_token: 'dummy-access', refresh_token: 'dummy-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const api = new Strava({ stravaClientId: 'dummy', stravaClientSecret: 'dummy' }, {}, async (url, options) => {
    requested.push(String(url));
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    return Response.json({ ...credentials, athlete: { id: 7, firstname: 'Private profile' } });
  });
  assert.deepEqual(await api.authorize('dummy-code'), { athleteId: 7, credentials });
  assert.deepEqual(requested, ['https://www.strava.com/oauth/token']);
  for (const athlete of [undefined, {}, { id: 0 }, { id: -1 }, { id: '7' }, { id: Number.MAX_SAFE_INTEGER + 1 }]) {
    let count = 0;
    api.fetch = async url => {
      count++; assert.equal(String(url), 'https://www.strava.com/oauth/token');
      return Response.json({ ...credentials, athlete });
    };
    await assert.rejects(api.authorize('dummy-code'), /strava_identity_mismatch/);
    assert.equal(count, 1);
  }
});
test('configuration enforces HTTPS and exact upstream callback without a separate credential mode/key', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', MCP_PUBLIC_URL: 'https://mcp.example.com',
    MCP_CLIENT_ID: 'dummy', MCP_CLIENT_SECRET: 'dummy', MCP_REDIRECT_URIS: 'https://chatgpt.com/callback',
    STRAVA_CLIENT_ID: 'dummy', STRAVA_CLIENT_SECRET: 'dummy', STRAVA_REDIRECT_URI: 'https://mcp.example.com/strava/callback' };
  assert.equal(loadConfig(env).resource, 'https://mcp.example.com/mcp');
  assert.throws(() => loadConfig({ ...env, MCP_PUBLIC_URL: 'http://mcp.example.com' }));
  assert.throws(() => loadConfig({ ...env, STRAVA_REDIRECT_URI: 'https://other.example.com/strava/callback' }));
  assert.throws(() => loadConfig({ ...env, MCP_REDIRECT_URIS: 'https://chatgpt.com/callback#fragment' }));
  assert.equal('encryptionKey' in loadConfig(env), false);
  assert.equal('credentialMode' in loadConfig(env), false);
});
test('rate-limit store caps retained identities rather than evicting active limits', async () => {
  const store = new BoundedRateStore();
  store.init({ windowMs: 60_000 });
  try {
    for (let i = 0; i < 5000; i++) await store.increment(String(i));
    assert.equal((await store.increment('overflow')).totalHits, Number.MAX_SAFE_INTEGER);
    assert.equal(store.current.size + store.previous.size, 5000);
    assert.equal((await store.increment('1')).totalHits, 2);
  } finally { store.shutdown(); }
});
test('schema artifact exactly reflects published input bounds', async () => {
  const { readFile } = await import('node:fs/promises');
  const artifact = JSON.parse(await readFile(new URL('../schema/tools.json', import.meta.url), 'utf8'));
  for (const [name, schema] of Object.entries(inputs)) {
    const generated = JSON.parse(JSON.stringify((await import('zod')).z.toJSONSchema(schema, { io: 'input' })));
    const documented = artifact.$defs[name + '_input'];
    assert.deepEqual(generated.properties, documented.properties);
    assert.deepEqual(generated.required || [], documented.required || []);
    assert.equal(documented.additionalProperties, false);
  }
});
