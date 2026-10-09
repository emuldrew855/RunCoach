import { z } from 'zod';
import { SafeError } from './store.js';
import { isRun, validActivity, safeActivity, monday, fetchActivities, periodBounds, trainingSummary, compareSummaries, finiteMetric, STREAM_KEYS, safeStreams } from './training.js';

const integer = (min, max) => z.number().int().min(min).max(max);
const recentInput = z.object({ days: integer(1, 365).default(30), page: integer(1, 100).default(1), per_page: integer(1, 50).default(20) }).strict();
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodInput = z.object({ start_date: dateInput, end_date: dateInput }).strict();
export const inputs = {
  get_recent_runs: recentInput,
  get_run_details: z.object({ activity_id: integer(1, Number.MAX_SAFE_INTEGER), split_offset: integer(0, 10000).default(0), split_limit: integer(1, 100).default(100) }).strict(),
  get_weekly_summary: z.object({ weeks: integer(1, 52).default(4) }).strict(),
  get_recent_activities: recentInput,
  get_training_summary: periodInput,
  compare_training_periods: z.object({ baseline: periodInput, comparison: periodInput }).strict(),
  get_activity_streams: z.object({ activity_id: integer(1, Number.MAX_SAFE_INTEGER), max_points: integer(2, 1000).default(200) }).strict(),
};
export { isRun };
export const safeRun = safeActivity;
const splitFields = ['split', 'distance', 'elapsed_time', 'moving_time', 'elevation_difference', 'average_speed', 'average_heartrate', 'pace_zone'];
function safeSplit(split) {
  return Object.fromEntries(splitFields.filter(key => Number.isFinite(split[key])).map(key => [key, split[key]]));
}
export async function callTool(name, raw, grant, strava, clock = () => new Date()) {
  if (!inputs[name]) throw new SafeError('unknown_tool');
  const parsed = inputs[name].safeParse(raw);
  if (!parsed.success) throw new SafeError('invalid_tool_input');
  const args = parsed.data, current = clock(), fetched_at = current.toISOString();
  const athleteId = Number(grant.athlete_id);
  if (name === 'get_training_summary') return trainingSummary(args, current, athleteId, strava);
  if (name === 'compare_training_periods') {
    periodBounds(args.baseline, current); periodBounds(args.comparison, current);
    const baseline = await trainingSummary(args.baseline, current, athleteId, strava);
    const comparison = await trainingSummary(args.comparison, current, athleteId, strava);
    return compareSummaries(baseline, comparison);
  }
  if (name === 'get_run_details' || name === 'get_activity_streams') {
    const activity = await strava.get(athleteId, `activities/${args.activity_id}`);
    if (activity?.athlete?.id !== athleteId) throw new SafeError('activity_not_owned', 403);
    if (!validActivity(activity, current) || !isRun(activity)) throw new SafeError('not_a_run');
    if (name === 'get_activity_streams') {
      if (activity.id !== args.activity_id) throw new SafeError('strava_invalid_response', 502);
      const streams = await strava.get(athleteId, `activities/${args.activity_id}/streams`, { keys: STREAM_KEYS.join(','), key_by_type: true });
      return { fetched_at, run: safeRun(activity), ...safeStreams(streams, args.max_points) };
    }
    const splits = Array.isArray(activity.splits_metric) ? activity.splits_metric : [];
    const end = args.split_offset + args.split_limit;
    return { fetched_at, run: safeRun(activity), splits_metric: splits.slice(args.split_offset, end).map(safeSplit),
      split_offset: args.split_offset, total_splits: splits.length, next_split_offset: end < splits.length ? end : null };
  }
  if (name === 'get_recent_runs' || name === 'get_recent_activities') {
    const after = Math.floor(current.getTime() / 1000 - args.days * 86400);
    const activities = await strava.get(athleteId, 'athlete/activities', { after, page: args.page, per_page: args.per_page });
    if (!Array.isArray(activities) || activities.length > args.per_page) throw new SafeError('strava_invalid_response', 502);
    const result = activities.filter(a => validActivity(a, current) && (name !== 'get_recent_runs' || isRun(a)) &&
      new Date(a.start_date).getTime() > after * 1000).map(safeActivity);
    return { fetched_at, ...(name === 'get_recent_runs' ? { runs: result } : { activities: result, truncated: args.page === 100 && activities.length >= args.per_page }),
      page: args.page, per_page: args.per_page, pagination_applies_to: 'all_sports',
      has_more: activities.length >= args.per_page, next_page: activities.length >= args.per_page && args.page < 100 ? args.page + 1 : null };
  }
  const start = monday(current); start.setUTCDate(start.getUTCDate() - (args.weeks - 1) * 7);
  const weeks = Array.from({ length: args.weeks }, (_, i) => {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i * 7);
    return { week_start: d.toISOString().slice(0, 10), runs: 0, distance_meters: 0, moving_time_seconds: 0, elevation_meters: 0 };
  });
  const fetched = await fetchActivities(strava, athleteId, start, current, current);
  for (const activity of fetched.activities) {
      if (!isRun(activity)) continue;
      const index = Math.floor((monday(activity.start_date).getTime() - start.getTime()) / (7 * 86400_000));
      if (!weeks[index]) continue;
      const week = weeks[index], safe = safeRun(activity);
      week.runs++; week.distance_meters = finiteMetric(week.distance_meters + (safe.distance || 0));
      week.moving_time_seconds = finiteMetric(week.moving_time_seconds + (safe.moving_time || 0));
      week.elevation_meters = finiteMetric(week.elevation_meters + (safe.total_elevation_gain || 0));
  }
  return { fetched_at, weeks, timezone: 'UTC', week_starts_on: 'Monday', current_week_incomplete: true,
    partial: fetched.partial, truncated: fetched.truncated, upstream_pages: fetched.upstream_pages,
    max_activities: fetched.max_activities, coverage: fetched.coverage };
}
export function registerTools(server, grant, strava) {
  for (const [name, schema] of Object.entries(inputs)) {
    server.registerTool(name, {
      description: {
        get_recent_runs: 'Accessible runs over the last 1-365 days (default 30). Follow next_page with unchanged days/per_page, even for empty run pages. has_more=true with next_page=null means the 100-page cap was reached.',
        get_run_details: 'Owned run metrics and bounded metric splits, without GPS or descriptions.',
        get_weekly_summary: 'UTC Monday run totals over 1-52 weeks (default 4). For six calendar months request 28 weeks, or use get_training_summary for exact dates. Never treat truncated totals as complete.',
        get_recent_activities: 'Paginated safe metrics for all sports, including cross-training, over 1-365 days (default 30). Follow next_page with unchanged days/per_page; truncated reports the 100-page cap. No GPS or profiles.',
        get_training_summary: 'Server-calculated running totals, frequency, UTC weekly buckets and five longest runs for inclusive start_date/end_date (YYYY-MM-DD), at most 365 calendar days ending no later than today. Retrieval capped at 1,000 all-sport activities; inspect partial and metric_coverage.',
        compare_training_periods: 'Compare baseline and comparison date ranges using get_training_summary metrics; each inclusive range is at most 365 days. Weekly rates normalize unequal durations. Deltas are null for truncated retrieval or incomplete metrics; not a fitness or injury-risk diagnosis.',
        get_activity_streams: 'Owned RUN time, distance, speed, heart-rate, cadence and altitude streams; no GPS. max_points 2-1000 (default 200), uniformly sampled across the entire run. Missing streams are explicit. Samples may omit peaks and cannot establish exact intervals.',
      }[name],
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
