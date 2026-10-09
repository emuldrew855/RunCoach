import { z } from 'zod';
import { SafeError } from './store.js';

const integer = (min, max) => z.number().int().min(min).max(max);
export const inputs = {
  get_recent_runs: z.object({ days: integer(1, 365).default(30), page: integer(1, 100).default(1), per_page: integer(1, 50).default(20) }).strict(),
  get_run_details: z.object({ activity_id: integer(1, Number.MAX_SAFE_INTEGER), split_offset: integer(0, 10000).default(0), split_limit: integer(1, 100).default(100) }).strict(),
  get_weekly_summary: z.object({ weeks: integer(1, 52).default(4) }).strict(),
};
export const isRun = activity => ['Run', 'TrailRun', 'VirtualRun'].includes(activity.sport_type || activity.type);
const numericFields = ['distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'average_speed', 'max_speed', 'average_heartrate', 'max_heartrate', 'average_cadence'];
export function safeRun(activity) {
  const result = { activity_id: activity.id, type: activity.sport_type || activity.type };
  if (typeof activity.name === 'string') result.title = activity.name.slice(0, 200);
  const date = new Date(activity.start_date);
  if (Number.isFinite(date.getTime())) result.start_date = date.toISOString();
  for (const key of numericFields) if (Number.isFinite(activity[key]) && activity[key] >= 0) result[key] = activity[key];
  if (activity.average_speed > 0 && Number.isFinite(1000 / activity.average_speed)) result.pace_seconds_per_km = 1000 / activity.average_speed;
  return result;
}
const splitFields = ['split', 'distance', 'elapsed_time', 'moving_time', 'elevation_difference', 'average_speed', 'average_heartrate', 'pace_zone'];
function safeSplit(split) {
  return Object.fromEntries(splitFields.filter(key => Number.isFinite(split[key])).map(key => [key, split[key]]));
}
function monday(date) {
  const d = new Date(date); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d;
}
export async function callTool(name, raw, grant, strava, clock = () => new Date()) {
  if (!inputs[name]) throw new SafeError('unknown_tool');
  const parsed = inputs[name].safeParse(raw);
  if (!parsed.success) throw new SafeError('invalid_tool_input');
  const args = parsed.data, current = clock(), fetched_at = current.toISOString();
  const athleteId = Number(grant.athlete_id);
  const validActivity = a => Number.isSafeInteger(a.id) && isRun(a) &&
    Number.isFinite(new Date(a.start_date).getTime()) && new Date(a.start_date) <= current;
  if (name === 'get_run_details') {
    const activity = await strava.get(athleteId, `activities/${args.activity_id}`);
    if (activity.athlete?.id !== athleteId) throw new SafeError('activity_not_owned', 403);
    if (!validActivity(activity)) throw new SafeError('not_a_run');
    const splits = Array.isArray(activity.splits_metric) ? activity.splits_metric : [];
    const end = args.split_offset + args.split_limit;
    return { fetched_at, run: safeRun(activity), splits_metric: splits.slice(args.split_offset, end).map(safeSplit),
      split_offset: args.split_offset, total_splits: splits.length, next_split_offset: end < splits.length ? end : null };
  }
  if (name === 'get_recent_runs') {
    const after = Math.floor(current.getTime() / 1000 - args.days * 86400);
    const activities = await strava.get(athleteId, 'athlete/activities', { after, page: args.page, per_page: args.per_page });
    if (!Array.isArray(activities)) throw new SafeError('strava_invalid_response', 502);
    return { fetched_at, runs: activities.slice(0, args.per_page).filter(a => validActivity(a) && new Date(a.start_date).getTime() > after * 1000).map(safeRun),
      page: args.page, per_page: args.per_page, pagination_applies_to: 'all_sports',
      has_more: activities.length >= args.per_page, next_page: activities.length >= args.per_page && args.page < 100 ? args.page + 1 : null };
  }
  const start = monday(current); start.setUTCDate(start.getUTCDate() - (args.weeks - 1) * 7);
  const weeks = Array.from({ length: args.weeks }, (_, i) => {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i * 7);
    return { week_start: d.toISOString().slice(0, 10), runs: 0, distance_meters: 0, moving_time_seconds: 0, elevation_meters: 0 };
  });
  let partial = true, pages = 0;
  const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    const activities = await strava.get(athleteId, 'athlete/activities', { after: Math.floor(start.getTime() / 1000) - 1, before: Math.floor(current.getTime() / 1000) + 1, page, per_page: 100 });
    if (!Array.isArray(activities)) throw new SafeError('strava_invalid_response', 502);
    pages++;
    for (const activity of activities) {
      if (!validActivity(activity) || seen.has(activity.id)) continue;
      seen.add(activity.id);
      const index = Math.floor((monday(activity.start_date).getTime() - start.getTime()) / (7 * 86400_000));
      if (!weeks[index]) continue;
      const week = weeks[index], safe = safeRun(activity);
      week.runs++; week.distance_meters += safe.distance || 0;
      week.moving_time_seconds += safe.moving_time || 0; week.elevation_meters += safe.total_elevation_gain || 0;
    }
    if (activities.length < 100) { partial = false; break; }
  }
  return { fetched_at, weeks, timezone: 'UTC', week_starts_on: 'Monday', current_week_incomplete: true,
    partial, truncated: partial, upstream_pages: pages, max_activities: 1000,
    coverage: partial ? 'Incomplete: upstream pagination cap reached' : 'All accessible activities in the requested interval fetched' };
}
export function registerTools(server, grant, strava) {
  for (const [name, schema] of Object.entries(inputs)) {
    server.registerTool(name, {
      description: { get_recent_runs: 'Accessible runs over the last 1-365 days (default 30), including historical training reviews. Follow next_page with the same days and per_page until null; page limits apply to all sports, even when runs is empty.', get_run_details: 'Owned run metrics and bounded metric splits, without GPS or descriptions.', get_weekly_summary: 'UTC Monday weekly run totals over 1-52 weeks (default 4). For a six-month review request 27 weeks to include the partial current week. Explicitly reports bounded-fetch truncation; do not treat partial totals as complete.' }[name],
      inputSchema: schema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async args => {
      try {
        const data = await callTool(name, args, grant, strava);
        return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        const data = { error: error instanceof SafeError ? error.code : 'service_unavailable' };
        if (error.retryAfter) data.retry_after_seconds = Number(error.retryAfter);
        return { isError: true, structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
    });
  }
}
