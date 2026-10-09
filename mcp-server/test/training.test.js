import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { callTool, inputs, registerTools } from '../src/tools.js';
import { STREAM_KEYS } from '../src/training.js';

const current = new Date('2026-10-08T08:00:00Z'), clock = () => current, grant = { athlete_id: '7' };
const period = { start_date: '2026-10-01', end_date: '2026-10-07' };
const run = { id: 42, athlete: { id: 7 }, sport_type: 'Run', start_date: '2026-10-07T10:00:00Z',
  distance: 10000, moving_time: 3000, average_speed: 10 / 3, total_elevation_gain: 50,
  name: 'Run', description: 'private', map: { summary_polyline: 'gps' }, gear_id: 'private' };
const upstream = value => ({ get: async () => value });
const invoke = (name, args, api) => callTool(name, args, grant, api, clock);

test('new inputs reject identities, unsupported keys, malformed dates and oversized streams', async () => {
  for (const [name, args] of [
    ['get_recent_activities', { athlete_id: 7 }], ['get_recent_activities', { days: 366 }],
    ['get_training_summary', { ...period, userId: 7 }], ['get_training_summary', { ...period, start_date: '10/01/2026' }],
    ['get_training_summary', { start_date: period.start_date }],
    ['compare_training_periods', { baseline: { ...period, athleteId: 7 }, comparison: period }],
    ['get_activity_streams', { activity_id: 42, keys: ['latlng'] }],
    ['get_activity_streams', { activity_id: 42, max_points: 1 }], ['get_activity_streams', { activity_id: 42, max_points: 1001 }],
    ['get_activity_streams', { activity_id: 42, max_points: 2.5 }], ['get_activity_streams', { activity_id: 0 }],
  ]) {
    assert.equal(inputs[name].safeParse(args).success, false);
    await assert.rejects(invoke(name, args, { get: async () => assert.fail('Invalid inputs must not fetch') }), /invalid_tool_input/);
  }
  assert.equal(inputs.get_activity_streams.parse({ activity_id: 42 }).max_points, 200);
});

test('date ranges validate calendar reality, order, today and exact 365-day bounds before fetching', async () => {
  for (const args of [
    { start_date: '2026-02-29', end_date: '2026-03-01' },
    { start_date: '2026-04-31', end_date: '2026-05-01' },
    { start_date: '2026-10-07', end_date: '2026-10-01' },
    { start_date: '2026-10-08', end_date: '2026-10-09' },
    { start_date: '2025-10-08', end_date: '2026-10-08' },
  ]) await assert.rejects(invoke('get_training_summary', args, { get: async () => assert.fail('Invalid dates must not fetch') }), /invalid_tool_input/);
  const maximum = await invoke('get_training_summary', { start_date: '2025-10-09', end_date: '2026-10-08' }, upstream([]));
  assert.equal(maximum.period.calendar_days, 365);
  assert.equal(maximum.weeks.length, 53);
  assert.equal(maximum.period.current_day_incomplete, true);
  assert.equal(maximum.period.effective_end, current.toISOString());
  const leap = await invoke('get_training_summary', { start_date: '2024-02-29', end_date: '2024-02-29' }, upstream([]));
  assert.equal(leap.period.calendar_days, 1);
  await assert.rejects(invoke('compare_training_periods', { baseline: period,
    comparison: { start_date: '2026-10-08', end_date: '2026-10-09' } },
  { get: async () => assert.fail('Validate both periods before any fetch') }), /invalid_tool_input/);
});

test('exact inclusive UTC boundaries, deduplication, running-only totals and metric coverage', async () => {
  const args = { start_date: '2026-10-04', end_date: '2026-10-07' };
  const first = { ...run, id: 1, start_date: '2026-10-04T00:00:00Z' };
  const last = { ...run, id: 2, distance: 5000, moving_time: 1800, start_date: '2026-10-07T23:59:59.999Z' };
  const missing = { ...run, id: 3, distance: undefined, moving_time: 100, total_elevation_gain: undefined };
  const result = await invoke('get_training_summary', args, { get: async (athlete, path, params) => {
    assert.equal(athlete, 7); assert.equal(path, 'athlete/activities');
    assert.equal(params.after, Date.parse('2026-10-04T00:00:00Z') / 1000 - 1);
    assert.equal(params.before, Date.parse('2026-10-08T00:00:00Z') / 1000);
    return [first, last, missing, first, { ...run, id: 4, sport_type: 'Ride' },
      { ...run, id: 5, start_date: '2026-10-03T23:59:59Z' }, { ...run, id: 6, start_date: '2026-10-08T00:00:00Z' },
      null, { ...run, id: 7, start_date: 'invalid' }];
  } });
  assert.equal(result.totals.runs, 3); assert.equal(result.totals.active_days, 2);
  assert.equal(result.totals.distance_meters, 15000); assert.equal(result.totals.moving_time_seconds, 4900);
  assert.equal(result.totals.aggregate_pace_seconds_per_km, 320);
  assert.deepEqual(result.totals.metric_coverage, { distance: 2, moving_time: 3, total_elevation_gain: 2, pace_pairs: 2 });
  assert.deepEqual(result.longest_runs.map(r => r.activity_id), [1, 2]);
  assert.equal(result.weeks.length, 2);
  assert.equal(result.weeks[0].week_start, '2026-09-28'); assert.equal(result.weeks[0].runs, 1);
  assert.equal(result.weeks[1].week_start, '2026-10-05'); assert.equal(result.weeks[1].runs, 2);
  assert.ok(result.weeks.every(week => week.calendar_week_incomplete));
  assert.equal(result.partial, false); assert.equal(result.upstream_pages, 1);
  for (const secret of ['private', 'gps', 'gear_id', 'athlete']) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('longest runs are bounded, deterministic and missing metrics never invent pace', async () => {
  const result = await invoke('get_training_summary', period, upstream(Array.from({ length: 8 }, (_, i) => ({
    ...run, id: i + 1, distance: i * 1000, moving_time: undefined, total_elevation_gain: NaN,
  }))));
  assert.deepEqual(result.longest_runs.map(r => r.activity_id), [8, 7, 6, 5, 4]);
  assert.equal(result.totals.aggregate_pace_seconds_per_km, null);
  assert.equal(result.totals.metric_coverage.moving_time, 0);
  assert.equal(result.totals.metric_coverage.total_elevation_gain, 0);
  assert.equal(result.totals.metric_coverage.pace_pairs, 0);
});

test('non-finite sensor metrics never produce pace and arithmetic overflow is an explicit upstream error', async () => {
  const activity = { ...run, average_speed: Infinity };
  const listing = await invoke('get_recent_activities', {}, upstream([activity]));
  assert.equal(listing.activities[0].pace_seconds_per_km, undefined);
  const extreme = { ...run, distance: Number.MAX_VALUE, moving_time: 0 };
  for (const name of ['get_training_summary', 'get_weekly_summary']) {
    await assert.rejects(invoke(name, name === 'get_training_summary' ? period : {}, upstream([
      extreme, { ...extreme, id: 43 },
    ])), /strava_invalid_response/);
  }
  const args = { baseline: { start_date: '2026-09-01', end_date: '2026-09-07' }, comparison: period };
  await assert.rejects(invoke('compare_training_periods', args, { get: async (_a, _p, params) =>
    params.after < Date.parse('2026-10-01') / 1000 - 1 ?
      [{ ...run, start_date: '2026-09-07T10:00:00Z', distance: Number.MIN_VALUE, moving_time: 0 }] : [run],
  }), /strava_invalid_response/);
});

test('summary pages through full cross-training pages and reports the all-sport budget truthfully', async () => {
  let calls = 0;
  const api = { get: async (_athlete, _path, params) => {
    assert.equal(params.page, ++calls); assert.equal(params.per_page, 100);
    return calls === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 100, sport_type: 'Ride' })) : [run];
  } };
  const result = await invoke('get_training_summary', period, api);
  assert.equal(result.totals.runs, 1); assert.equal(result.upstream_pages, 2); assert.equal(result.partial, false);
  calls = 0;
  const capped = await invoke('get_training_summary', period, { get: async () => {
    calls++; return Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 100, sport_type: 'Ride' }));
  } });
  assert.equal(calls, 10); assert.equal(capped.max_activities, 1000);
  assert.equal(capped.partial, true); assert.equal(capped.truncated, true); assert.equal(capped.totals.runs, 0);
  assert.match(capped.coverage, /Incomplete/);
});

test('comparison normalizes unequal periods, signs deltas, and handles zero baselines/missing metrics', async () => {
  const args = { baseline: { start_date: '2026-09-01', end_date: '2026-09-07' },
    comparison: { start_date: '2026-09-08', end_date: '2026-09-21' } };
  const earlier = { ...run, start_date: '2026-09-07T10:00:00Z' };
  const later = { ...run, id: 43, distance: 20000, moving_time: 5000, start_date: '2026-09-14T10:00:00Z' };
  const api = { get: async (_athlete, _path, params) => params.after < Date.parse('2026-09-07') / 1000 ? [earlier] : [later] };
  const result = await invoke('compare_training_periods', args, api);
  assert.deepEqual(result.deltas.distance_meters, { absolute: 10000, percent: 100 });
  assert.deepEqual(result.deltas.distance_meters_per_week, { absolute: 0, percent: 0 });
  assert.deepEqual(result.deltas.runs_per_week, { absolute: -0.5, percent: -50 });
  assert.ok(result.deltas.aggregate_pace_seconds_per_km.absolute < 0);
  assert.equal(result.comparison_available, true);
  const zero = await invoke('compare_training_periods', args, { get: async (_a, _p, params) =>
    params.after < Date.parse('2026-09-07') / 1000 ? [] : [{ ...later, total_elevation_gain: undefined }] });
  assert.deepEqual(zero.deltas.runs, { absolute: 1, percent: null });
  assert.equal(zero.deltas.elevation_meters, null); assert.equal(zero.deltas.aggregate_pace_seconds_per_km, null);
});

test('comparison caps twenty requests and withholds all deltas for truncated ranges', async () => {
  let calls = 0;
  const result = await invoke('compare_training_periods', { baseline: period, comparison: period }, { get: async () => {
    calls++; return Array.from({ length: 100 }, (_, i) => ({ ...run, id: i + 1 }));
  } });
  assert.equal(calls, 20); assert.equal(result.upstream_pages, 20); assert.equal(result.max_activities, 2000);
  assert.equal(result.partial, true); assert.equal(result.comparison_available, false);
  assert.ok(Object.values(result.deltas).every(value => value === null));
});

test('all-sport listings retain safe metrics without applying running pace to other sports', async () => {
  const result = await invoke('get_recent_activities', { per_page: 4 }, upstream([
    run, { ...run, id: 43, sport_type: 'Ride' }, { ...run, id: 44, sport_type: 'Swim' }, { ...run, start_date: '2027-01-01' },
  ]));
  assert.deepEqual(result.activities.map(a => a.type), ['Run', 'Ride', 'Swim']);
  assert.ok(result.activities[0].pace_seconds_per_km > 0);
  assert.equal(result.activities[1].pace_seconds_per_km, undefined);
  assert.equal(result.activities[2].pace_seconds_per_km, undefined);
  assert.equal(result.next_page, 2); assert.equal(result.truncated, false);
  const capped = await invoke('get_recent_activities', { page: 100, per_page: 1 }, upstream([run]));
  assert.equal(capped.has_more, true); assert.equal(capped.next_page, null); assert.equal(capped.truncated, true);
});

const streams = length => ({
  time: { data: Array.from({ length }, (_, i) => i), original_size: length },
  distance: { data: Array.from({ length }, (_, i) => i * 3) },
  cadence: { data: Array.from({ length }, () => 80) },
  altitude: { data: Array.from({ length }, (_, i) => i - 20) },
  latlng: { data: [[1, 2]], hidden: 'gps' },
});
const streamApi = raw => ({ get: async (athlete, path, params) => {
  assert.equal(athlete, 7);
  if (path === 'activities/42') return run;
  assert.equal(path, 'activities/42/streams');
  assert.deepEqual(params, { keys: STREAM_KEYS.join(','), key_by_type: true });
  return raw;
} });

test('streams verify ownership, sport, activity ID and date before fetching any series', async () => {
  for (const [activity, error] of [
    [{ ...run, athlete: { id: 8 } }, /activity_not_owned/],
    [{ ...run, sport_type: 'Ride' }, /not_a_run/],
    [{ ...run, start_date: '2027-01-01' }, /not_a_run/],
    [{ ...run, id: 43 }, /strava_invalid_response/],
  ]) {
    let calls = 0;
    await assert.rejects(invoke('get_activity_streams', { activity_id: 42 }, { get: async (_a, path) => {
      calls++; assert.equal(path, 'activities/42'); return activity;
    } }), error);
    assert.equal(calls, 1);
  }
});

test('stream downsampling aligns sensors, preserves endpoints, caps output and removes GPS', async () => {
  for (const max_points of [2, 200, 1000]) {
    const result = await invoke('get_activity_streams', { activity_id: 42, max_points }, streamApi(streams(2001)));
    assert.equal(result.samples.length, max_points); assert.equal(result.source_points, 2001);
    assert.equal(result.returned_points, max_points); assert.equal(result.sampled, true);
    assert.equal(result.samples[0].time, 0); assert.equal(result.samples.at(-1).time, 2000);
    assert.ok(result.samples.every(sample => sample.distance === sample.time * 3 && sample.cadence === 80));
    assert.deepEqual(result.missing_streams, ['velocity_smooth', 'heartrate']);
    assert.equal(result.samples[0].altitude, -20);
    assert.equal(JSON.stringify(result).includes('latlng'), false);
    assert.equal(JSON.stringify(result).includes('gps'), false);
  }
  const raw = streams(1); raw.time.original_size = 5;
  const one = await invoke('get_activity_streams', { activity_id: 42 }, streamApi(raw));
  assert.equal(one.samples.length, 1); assert.equal(one.sampled, false); assert.equal(one.upstream_reduced, true);
  const empty = await invoke('get_activity_streams', { activity_id: 42 }, streamApi({}));
  assert.deepEqual(empty.samples, []); assert.deepEqual(empty.missing_streams, STREAM_KEYS);
});

test('stream validation rejects malformed, unaligned, nonnumeric and oversized source data', async () => {
  for (const raw of [
    null, [], { distance: { data: [1] } },
    { time: { data: [0, 1] }, heartrate: { data: [100] } },
    { time: { data: [1, 0] } }, { time: { data: [0, NaN] } },
    { time: { data: [0] }, heartrate: { data: [-1] } },
    { time: { data: [0] }, distance: { data: ['private'] } },
    { time: { data: Array.from({ length: 200001 }, (_, i) => i) } },
  ]) await assert.rejects(invoke('get_activity_streams', { activity_id: 42 }, streamApi(raw)), /strava_invalid_response/);
});

test('all seven tools register read-only and return identical structured/text results with safe errors', async () => {
  const registered = {};
  registerTools({ registerTool: (name, metadata, handler) => { registered[name] = { metadata, handler }; } }, grant,
    { get: async () => { throw new Error('private-token-url'); } });
  assert.equal(Object.keys(registered).length, 7);
  for (const [name, entry] of Object.entries(registered)) {
    assert.ok(entry.metadata.description);
    assert.equal(entry.metadata.annotations.readOnlyHint, true);
    const args = name === 'compare_training_periods' ? { baseline: period, comparison: period } :
      name === 'get_training_summary' ? period : name === 'get_run_details' || name === 'get_activity_streams' ? { activity_id: 42 } : {};
    const result = await entry.handler(args);
    assert.equal(result.isError, true); assert.deepEqual(result.structuredContent, { error: 'service_unavailable' });
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('documented output contracts cover exact successful shapes and bounds of all tools', async () => {
  const artifact = JSON.parse(await readFile(new URL('../schema/tools.json', import.meta.url), 'utf8'));
  function check(value, schema) {
    if (schema.$ref) return check(value, artifact.$defs[schema.$ref.split('/').at(-1)]);
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.type) assert.ok(types.includes(type) || (types.includes('integer') && Number.isSafeInteger(value)));
    if (schema.const !== undefined) assert.deepEqual(value, schema.const);
    if (schema.enum) assert.ok(schema.enum.includes(value));
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value));
      if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
      if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
    }
    if (type === 'array') {
      if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
      for (const item of value) check(item, schema.items);
    }
    if (type === 'object') {
      for (const key of schema.required || []) assert.ok(Object.hasOwn(value, key), 'Missing ' + key);
      for (const [key, item] of Object.entries(value)) {
        if (schema.additionalProperties === false) assert.ok(Object.hasOwn(schema.properties, key), 'Extra ' + key);
        if (schema.properties?.[key]) check(item, schema.properties[key]);
      }
    }
  }
  for (const name of Object.keys(inputs)) {
    const args = name === 'compare_training_periods' ? { baseline: period, comparison: period } :
      name === 'get_training_summary' ? period : name === 'get_run_details' || name === 'get_activity_streams' ? { activity_id: 42 } : {};
    const api = name === 'get_activity_streams' ? streamApi(streams(20)) :
      name === 'get_run_details' ? upstream(run) : upstream([run]);
    const result = await invoke(name, args, api);
    check(result, artifact.$defs[name + '_output']);
    assert.ok(Object.hasOwn(artifact.properties, name));
  }
});
