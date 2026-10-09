import { SafeError } from './store.js';

const DAY = 86400_000;
export const isRun = activity => ['Run', 'TrailRun', 'VirtualRun'].includes(activity.sport_type || activity.type);
export const validActivity = (activity, current) => activity && Number.isSafeInteger(activity.id) && activity.id > 0 &&
  typeof (activity.sport_type || activity.type) === 'string' && (activity.sport_type || activity.type).length <= 64 &&
  typeof activity.start_date === 'string' && Number.isFinite(new Date(activity.start_date).getTime()) &&
  new Date(activity.start_date) <= current;
const numericFields = ['distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'average_speed', 'max_speed', 'average_heartrate', 'max_heartrate', 'average_cadence'];
export function safeActivity(activity) {
  const result = { activity_id: activity.id, type: activity.sport_type || activity.type };
  if (typeof activity.name === 'string') result.title = activity.name.slice(0, 200);
  const date = new Date(activity.start_date);
  if (Number.isFinite(date.getTime())) result.start_date = date.toISOString();
  for (const key of numericFields) if (Number.isFinite(activity[key]) && activity[key] >= 0) result[key] = activity[key];
  if (isRun(activity) && Number.isFinite(activity.average_speed) && activity.average_speed > 0 && Number.isFinite(1000 / activity.average_speed)) result.pace_seconds_per_km = 1000 / activity.average_speed;
  return result;
}
export function monday(date) {
  const d = new Date(date); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d;
}
export function periodBounds(period, current) {
  const start = new Date(period.start_date + 'T00:00:00Z'), end = new Date(period.end_date + 'T00:00:00Z');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      start.toISOString().slice(0, 10) !== period.start_date || end.toISOString().slice(0, 10) !== period.end_date ||
      start > end || end > current || (end - start) / DAY >= 365) throw new SafeError('invalid_tool_input');
  return { start, end: new Date(Math.min(end.getTime() + DAY - 1, current.getTime())), calendarDays: (end - start) / DAY + 1 };
}
export async function fetchActivities(strava, athleteId, start, end, current) {
  const activities = [], seen = new Set();
  let partial = true, pages = 0;
  for (let page = 1; page <= 10; page++) {
    const batch = await strava.get(athleteId, 'athlete/activities', {
      after: Math.floor(start.getTime() / 1000) - 1, before: Math.floor(end.getTime() / 1000) + 1, page, per_page: 100,
    });
    if (!Array.isArray(batch) || batch.length > 100) throw new SafeError('strava_invalid_response', 502);
    pages++;
    for (const activity of batch) {
      if (!validActivity(activity, current) || seen.has(activity.id)) continue;
      const date = new Date(activity.start_date);
      if (date < start || date > end) continue;
      seen.add(activity.id); activities.push(activity);
    }
    if (batch.length < 100) { partial = false; break; }
  }
  return { activities, partial, truncated: partial, upstream_pages: pages, max_activities: 1000,
    coverage: partial ? 'Incomplete: upstream pagination cap reached' : 'All accessible activities in the requested interval fetched' };
}
export function finiteMetric(value) {
  if (!Number.isFinite(value)) throw new SafeError('strava_invalid_response', 502);
  return value;
}
function totals(runs) {
  const coverage = { distance: 0, moving_time: 0, total_elevation_gain: 0, pace_pairs: 0 };
  let distance = 0, time = 0, elevation = 0, paceDistance = 0, paceTime = 0;
  for (const run of runs) {
    if (run.distance !== undefined) { distance += run.distance; coverage.distance++; }
    if (run.moving_time !== undefined) { time += run.moving_time; coverage.moving_time++; }
    if (run.total_elevation_gain !== undefined) { elevation += run.total_elevation_gain; coverage.total_elevation_gain++; }
    if (run.distance > 0 && run.moving_time > 0) {
      paceDistance += run.distance; paceTime += run.moving_time; coverage.pace_pairs++;
    }
  }
  return { runs: runs.length, active_days: new Set(runs.map(r => r.start_date.slice(0, 10))).size,
    distance_meters: finiteMetric(distance), moving_time_seconds: finiteMetric(time), elevation_meters: finiteMetric(elevation),
    aggregate_pace_seconds_per_km: paceDistance > 0 ? finiteMetric(finiteMetric(paceTime) / finiteMetric(paceDistance) * 1000) : null,
    metric_coverage: coverage };
}
export async function trainingSummary(period, current, athleteId, strava) {
  const { start, end, calendarDays } = periodBounds(period, current);
  const fetched = await fetchActivities(strava, athleteId, start, end, current);
  const runs = fetched.activities.filter(isRun).map(safeActivity), summary = totals(runs), weeks = [];
  for (let week = monday(start); week <= end; week = new Date(week.getTime() + 7 * DAY)) {
    const next = new Date(week.getTime() + 7 * DAY);
    const inWeek = runs.filter(run => new Date(run.start_date) >= week && new Date(run.start_date) < next);
    weeks.push({ week_start: week.toISOString().slice(0, 10), ...totals(inWeek),
      calendar_week_incomplete: week < start || next.getTime() - 1 > end.getTime() });
  }
  return { fetched_at: current.toISOString(), period: { ...period, calendar_days: calendarDays,
    effective_end: end.toISOString(), current_day_incomplete: period.end_date === current.toISOString().slice(0, 10) },
    timezone: 'UTC', week_starts_on: 'Monday', totals: { ...summary, runs_per_week: summary.runs * 7 / calendarDays,
      distance_meters_per_week: finiteMetric(summary.distance_meters / calendarDays * 7) },
    weeks, longest_runs: [...runs].filter(r => r.distance !== undefined).sort((a, b) => b.distance - a.distance || a.activity_id - b.activity_id).slice(0, 5),
    partial: fetched.partial, truncated: fetched.truncated, upstream_pages: fetched.upstream_pages,
    max_activities: fetched.max_activities, coverage: fetched.coverage,
    metric_note: 'Totals sum available metrics only; metric_coverage counts runs supplying each metric. Pace uses paired distance and moving time, not an average of run paces.' };
}
export function compareSummaries(baseline, comparison) {
  const partial = baseline.partial || comparison.partial, deltas = {};
  const metrics = { runs: null, active_days: null, runs_per_week: null, distance_meters: 'distance',
    distance_meters_per_week: 'distance', moving_time_seconds: 'moving_time', elevation_meters: 'total_elevation_gain',
    aggregate_pace_seconds_per_km: 'pace_pairs' };
  for (const [metric, coverage] of Object.entries(metrics)) {
    const a = baseline.totals[metric], b = comparison.totals[metric];
    const completeMetrics = !coverage || [baseline, comparison].every(s => s.totals.metric_coverage[coverage] === s.totals.runs);
    deltas[metric] = !partial && completeMetrics && a !== null && b !== null
      ? { absolute: finiteMetric(b - a), percent: a === 0 ? null : finiteMetric((b - a) / a * 100) } : null;
  }
  return { fetched_at: baseline.fetched_at, baseline, comparison, deltas, partial, truncated: partial,
    comparison_available: !partial, upstream_pages: baseline.upstream_pages + comparison.upstream_pages, max_activities: 2000,
    comparison_note: 'Deltas are comparison minus baseline. Weekly rates normalize unequal calendar durations. Null means truncated retrieval, missing metrics, or an undefined baseline percentage. Pace differences are descriptive, not a fitness or injury-risk assessment.' };
}
export const STREAM_KEYS = ['time', 'distance', 'velocity_smooth', 'heartrate', 'cadence', 'altitude'];
export function safeStreams(raw, maxPoints) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new SafeError('strava_invalid_response', 502);
  const available = STREAM_KEYS.filter(key => Object.hasOwn(raw, key));
  const missing = STREAM_KEYS.filter(key => !available.includes(key));
  if (available.length && !available.includes('time')) throw new SafeError('strava_invalid_response', 502);
  const count = available.length ? raw.time?.data?.length : 0;
  if (!Number.isSafeInteger(count) || count > 200000) throw new SafeError('strava_invalid_response', 502);
  for (const key of available) {
    const stream = raw[key];
    if (!Array.isArray(stream?.data) || stream.data.length !== count ||
        stream.data.some(value => !Number.isFinite(value) || (key !== 'altitude' && value < 0)) ||
        (key === 'time' && stream.data.some((value, i) => i > 0 && value < stream.data[i - 1]))) {
      throw new SafeError('strava_invalid_response', 502);
    }
  }
  const returned = Math.min(count, maxPoints);
  const indices = Array.from({ length: returned }, (_, i) => returned === 1 ? 0 : Math.floor(i * (count - 1) / (returned - 1)));
  return { available_streams: available, missing_streams: missing,
    samples: indices.map(index => Object.fromEntries(available.map(key => [key, raw[key].data[index]]))),
    source_points: count, returned_points: returned, sampled: returned < count,
    upstream_reduced: available.some(key => Number.isSafeInteger(raw[key].original_size) && raw[key].original_size > count),
    sampling: 'Uniform source indices, including first and last; no interpolation. Samples may omit peaks and are not full-resolution workout intervals.',
    units: { time: 'seconds since activity start', distance: 'meters', velocity_smooth: 'meters/second',
      heartrate: 'beats/minute', cadence: 'Strava-reported cadence (not doubled)', altitude: 'meters' } };
}
