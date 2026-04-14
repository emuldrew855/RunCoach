/**
 * Baseline Metrics Service
 *
 * Computes and stores weekly baseline metrics for all users.
 * Enables trend-based coaching for users without structured training plans.
 *
 * Key capabilities:
 * - Compute weekly activity summaries
 * - Calculate 4-week rolling averages
 * - Detect volume and pace trends
 * - Infer runner type from activity patterns
 */

import pool from '../config/database';
import { BaselineMetrics, RollingBaseline, RunnerType } from '../types/models';

/**
 * Get the start of a week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  return new Date(d.setDate(diff));
}

/**
 * Compute weekly baseline metrics for a user
 * Called after activity sync or on a schedule
 */
export async function computeWeeklyBaseline(
  userId: number,
  weekStart: Date
): Promise<BaselineMetrics | null> {
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  try {
    // Get activities for this week
    const activitiesResult = await pool.query(
      `SELECT
        COUNT(*) as run_count,
        COALESCE(SUM(distance_meters) / 1000, 0) as total_distance_km,
        COALESCE(MAX(distance_meters) / 1000, 0) as longest_run_km,
        COALESCE(SUM(moving_time_seconds), 0) as total_duration_seconds,
        COALESCE(AVG(CASE WHEN average_speed > 0 THEN 1000 / (average_speed * 60) END), 0) as avg_pace_min_km,
        COALESCE(AVG(average_heartrate), 0) as avg_hr
      FROM activities
      WHERE user_id = $1
        AND sport_type IN ('Run', 'VirtualRun', 'TrailRun')
        AND DATE(start_date) >= $2
        AND DATE(start_date) <= $3`,
      [userId, weekStartStr, weekEndStr]
    );

    const weekData = activitiesResult.rows[0];

    if (parseInt(weekData.run_count) === 0) {
      // No runs this week - still save a record with zeros
      await pool.query(
        `INSERT INTO baseline_metrics (
          user_id, week_start, total_distance_km, run_count, longest_run_km,
          total_duration_seconds, avg_pace_min_km, avg_hr,
          rolling_avg_distance_km, rolling_avg_runs_per_week, rolling_avg_longest_run_km, rolling_avg_pace_min_km,
          distance_trend_percent, pace_trend_percent
        ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        ON CONFLICT (user_id, week_start)
        DO UPDATE SET
          total_distance_km = 0,
          run_count = 0,
          computed_at = CURRENT_TIMESTAMP`,
        [userId, weekStartStr]
      );
      return null;
    }

    // Get HR zone distribution for the week
    const hrZonesResult = await pool.query(
      `SELECT
        COALESCE(SUM(zone_1_seconds + zone_2_seconds), 0) as z12_seconds,
        COALESCE(SUM(zone_3_seconds), 0) as z3_seconds,
        COALESCE(SUM(zone_4_seconds + zone_5_seconds), 0) as z45_seconds,
        COALESCE(SUM(zone_1_seconds + zone_2_seconds + zone_3_seconds + zone_4_seconds + zone_5_seconds), 0) as total_seconds
      FROM activity_hr_zones hz
      JOIN activities a ON hz.activity_id = a.id
      WHERE a.user_id = $1
        AND DATE(a.start_date) >= $2
        AND DATE(a.start_date) <= $3`,
      [userId, weekStartStr, weekEndStr]
    );

    const hrData = hrZonesResult.rows[0];
    const totalHRSeconds = parseInt(hrData.total_seconds) || 1;
    const zone12Percent = Math.round((parseInt(hrData.z12_seconds) / totalHRSeconds) * 100);
    const zone3Percent = Math.round((parseInt(hrData.z3_seconds) / totalHRSeconds) * 100);
    const zone45Percent = Math.round((parseInt(hrData.z45_seconds) / totalHRSeconds) * 100);

    // Calculate 4-week rolling averages
    const rollingResult = await pool.query(
      `SELECT
        COALESCE(AVG(total_distance_km), 0) as avg_distance,
        COALESCE(AVG(run_count), 0) as avg_runs,
        COALESCE(AVG(longest_run_km), 0) as avg_longest,
        COALESCE(AVG(NULLIF(avg_pace_min_km, 0)), 0) as avg_pace
      FROM baseline_metrics
      WHERE user_id = $1
        AND week_start >= ($2::date - INTERVAL '3 weeks')
        AND week_start < $2::date`,
      [userId, weekStartStr]
    );

    const rolling = rollingResult.rows[0];

    // If we have previous data, calculate trends
    let distanceTrend = 0;
    let paceTrend = 0;

    const fourWeeksAgoResult = await pool.query(
      `SELECT total_distance_km, avg_pace_min_km
      FROM baseline_metrics
      WHERE user_id = $1
        AND week_start = ($2::date - INTERVAL '4 weeks')`,
      [userId, weekStartStr]
    );

    if (fourWeeksAgoResult.rows.length > 0) {
      const fourWeeksAgo = fourWeeksAgoResult.rows[0];
      if (fourWeeksAgo.total_distance_km > 0) {
        distanceTrend = ((parseFloat(weekData.total_distance_km) - fourWeeksAgo.total_distance_km) / fourWeeksAgo.total_distance_km) * 100;
      }
      if (fourWeeksAgo.avg_pace_min_km > 0 && parseFloat(weekData.avg_pace_min_km) > 0) {
        // Negative pace trend = improvement (faster)
        paceTrend = ((fourWeeksAgo.avg_pace_min_km - parseFloat(weekData.avg_pace_min_km)) / fourWeeksAgo.avg_pace_min_km) * 100;
      }
    }

    // Upsert the baseline metrics
    const result = await pool.query(
      `INSERT INTO baseline_metrics (
        user_id, week_start,
        total_distance_km, run_count, longest_run_km, total_duration_seconds,
        avg_pace_min_km, avg_hr,
        zone_1_2_percent, zone_3_percent, zone_4_5_percent,
        rolling_avg_distance_km, rolling_avg_runs_per_week, rolling_avg_longest_run_km, rolling_avg_pace_min_km,
        distance_trend_percent, pace_trend_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET
        total_distance_km = EXCLUDED.total_distance_km,
        run_count = EXCLUDED.run_count,
        longest_run_km = EXCLUDED.longest_run_km,
        total_duration_seconds = EXCLUDED.total_duration_seconds,
        avg_pace_min_km = EXCLUDED.avg_pace_min_km,
        avg_hr = EXCLUDED.avg_hr,
        zone_1_2_percent = EXCLUDED.zone_1_2_percent,
        zone_3_percent = EXCLUDED.zone_3_percent,
        zone_4_5_percent = EXCLUDED.zone_4_5_percent,
        rolling_avg_distance_km = EXCLUDED.rolling_avg_distance_km,
        rolling_avg_runs_per_week = EXCLUDED.rolling_avg_runs_per_week,
        rolling_avg_longest_run_km = EXCLUDED.rolling_avg_longest_run_km,
        rolling_avg_pace_min_km = EXCLUDED.rolling_avg_pace_min_km,
        distance_trend_percent = EXCLUDED.distance_trend_percent,
        pace_trend_percent = EXCLUDED.pace_trend_percent,
        computed_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        userId,
        weekStartStr,
        parseFloat(weekData.total_distance_km) || 0,
        parseInt(weekData.run_count) || 0,
        parseFloat(weekData.longest_run_km) || 0,
        parseInt(weekData.total_duration_seconds) || 0,
        parseFloat(weekData.avg_pace_min_km) || 0,
        parseFloat(weekData.avg_hr) || null,
        zone12Percent || null,
        zone3Percent || null,
        zone45Percent || null,
        parseFloat(rolling.avg_distance) || 0,
        parseFloat(rolling.avg_runs) || 0,
        parseFloat(rolling.avg_longest) || 0,
        parseFloat(rolling.avg_pace) || 0,
        Math.round(distanceTrend * 10) / 10,
        Math.round(paceTrend * 10) / 10,
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error(`Error computing baseline for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get the 4-week rolling baseline for a user
 * Used in coaching context when no training plan exists
 */
export async function get4WeekRollingBaseline(userId: number): Promise<RollingBaseline | null> {
  try {
    // Get last 4 weeks of baseline data
    const result = await pool.query(
      `SELECT *
      FROM baseline_metrics
      WHERE user_id = $1
        AND week_start >= (CURRENT_DATE - INTERVAL '4 weeks')
      ORDER BY week_start DESC
      LIMIT 4`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const weeks = result.rows;
    const weeksOfData = weeks.length;

    // Calculate averages from available weeks
    const avgDistanceKm = weeks.reduce((sum, w) => sum + parseFloat(w.total_distance_km), 0) / weeksOfData;
    const avgRunsPerWeek = weeks.reduce((sum, w) => sum + parseInt(w.run_count), 0) / weeksOfData;
    const avgLongestRunKm = weeks.reduce((sum, w) => sum + parseFloat(w.longest_run_km), 0) / weeksOfData;

    // Calculate average pace (excluding zero values)
    const paceWeeks = weeks.filter(w => parseFloat(w.avg_pace_min_km) > 0);
    const avgPaceMinKm = paceWeeks.length > 0
      ? paceWeeks.reduce((sum, w) => sum + parseFloat(w.avg_pace_min_km), 0) / paceWeeks.length
      : 0;

    // This week's data (most recent)
    const thisWeek = weeks[0];
    const thisWeekDistanceKm = parseFloat(thisWeek.total_distance_km);
    const thisWeekRuns = parseInt(thisWeek.run_count);

    // Calculate percent of baseline
    const percentOfBaseline = avgDistanceKm > 0
      ? Math.round((thisWeekDistanceKm / avgDistanceKm) * 100)
      : 100;

    // Determine trends from the stored trend values
    const distanceTrendPercent = parseFloat(thisWeek.distance_trend_percent) || 0;
    const paceTrendPercent = parseFloat(thisWeek.pace_trend_percent) || 0;

    let distanceTrend: 'increasing' | 'stable' | 'decreasing';
    if (distanceTrendPercent > 5) distanceTrend = 'increasing';
    else if (distanceTrendPercent < -5) distanceTrend = 'decreasing';
    else distanceTrend = 'stable';

    let paceTrend: 'improving' | 'stable' | 'declining';
    if (paceTrendPercent > 2) paceTrend = 'improving';
    else if (paceTrendPercent < -2) paceTrend = 'declining';
    else paceTrend = 'stable';

    return {
      avgDistanceKm: Math.round(avgDistanceKm * 10) / 10,
      avgRunsPerWeek: Math.round(avgRunsPerWeek * 10) / 10,
      avgLongestRunKm: Math.round(avgLongestRunKm * 10) / 10,
      avgPaceMinKm: Math.round(avgPaceMinKm * 100) / 100,
      thisWeekDistanceKm: Math.round(thisWeekDistanceKm * 10) / 10,
      thisWeekRuns,
      percentOfBaseline,
      distanceTrend,
      paceTrend,
      weeksOfData,
    };
  } catch (error) {
    console.error(`Error getting rolling baseline for user ${userId}:`, error);
    return null;
  }
}

/**
 * Infer runner type based on activity patterns and goals
 *
 * - architect: Has active race goal within 6 months
 * - builder: Volume trending up >5% over 4 weeks
 * - maintainer: Stable or decreasing volume, no specific goals
 */
export async function inferRunnerType(userId: number): Promise<RunnerType> {
  try {
    // Check for active race goal within 6 months
    const goalResult = await pool.query(
      `SELECT id, target_date
      FROM goals
      WHERE user_id = $1
        AND is_active = true
        AND target_date IS NOT NULL
        AND target_date <= CURRENT_DATE + INTERVAL '6 months'
        AND target_date >= CURRENT_DATE
      LIMIT 1`,
      [userId]
    );

    if (goalResult.rows.length > 0) {
      return 'architect';
    }

    // Check volume trend from baseline metrics
    const baselineResult = await pool.query(
      `SELECT distance_trend_percent
      FROM baseline_metrics
      WHERE user_id = $1
      ORDER BY week_start DESC
      LIMIT 1`,
      [userId]
    );

    if (baselineResult.rows.length > 0) {
      const trend = parseFloat(baselineResult.rows[0].distance_trend_percent) || 0;
      if (trend > 5) {
        return 'builder';
      }
    }

    // Default to maintainer
    return 'maintainer';
  } catch (error) {
    console.error(`Error inferring runner type for user ${userId}:`, error);
    return 'maintainer';
  }
}

/**
 * Update runner type for a user (with inference flag)
 */
export async function updateRunnerType(
  userId: number,
  runnerType: RunnerType,
  inferred: boolean = false
): Promise<void> {
  await pool.query(
    `UPDATE user_profiles
    SET runner_type = $2,
        runner_type_inferred = $3,
        runner_type_set_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1`,
    [userId, runnerType, inferred]
  );
}

/**
 * Compute baselines for all active users
 * Called by scheduled job (e.g., weekly on Sunday)
 */
export async function computeBaselinesForAllUsers(): Promise<void> {
  console.log('Starting baseline computation for all users...');

  try {
    // Get all users with recent activity
    const usersResult = await pool.query(
      `SELECT DISTINCT user_id
      FROM activities
      WHERE start_date >= CURRENT_DATE - INTERVAL '8 weeks'`
    );

    const weekStart = getWeekStart(new Date());

    for (const row of usersResult.rows) {
      try {
        await computeWeeklyBaseline(row.user_id, weekStart);
        console.log(`  Computed baseline for user ${row.user_id}`);
      } catch (error) {
        console.error(`  Failed to compute baseline for user ${row.user_id}:`, error);
      }
    }

    console.log(`Baseline computation complete for ${usersResult.rows.length} users`);
  } catch (error) {
    console.error('Error in baseline computation job:', error);
    throw error;
  }
}

/**
 * Backfill baseline metrics for a user (last 8 weeks)
 * Called when a new user is created or on-demand
 */
export async function backfillBaselineMetrics(userId: number): Promise<void> {
  console.log(`Backfilling baseline metrics for user ${userId}...`);

  const now = new Date();
  const currentWeekStart = getWeekStart(now);

  // Go back 8 weeks
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - (i * 7));

    try {
      await computeWeeklyBaseline(userId, weekStart);
    } catch (error) {
      console.error(`Failed to compute baseline for week ${weekStart.toISOString()}:`, error);
    }
  }

  console.log(`Backfill complete for user ${userId}`);
}
