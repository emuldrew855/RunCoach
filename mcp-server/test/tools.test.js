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
    ['get_recent_runs', { days: 91 }], ['get_recent_runs', { per_page: 51 }], ['get_recent_runs', { page: 0 }],
    ['get_run_details', { activity_id: Number.MAX_SAFE_INTEGER + 1 }], ['get_run_details', { activity_id: 1, split_limit: 101 }],
    ['get_weekly_summary', { weeks: 13 }],
  ]) assert.equal(inputs[name].safeParse(args).success, false);
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
