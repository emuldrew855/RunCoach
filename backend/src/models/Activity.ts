import { query } from '../config/database';
import { Activity } from '../types/models';

export async function getActivitiesByUserId(
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<Activity[]> {
  const result = await query(
    `SELECT * FROM activities
     WHERE user_id = $1
     ORDER BY start_date DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

export async function getActivityById(id: number): Promise<Activity | null> {
  const result = await query(
    'SELECT * FROM activities WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function upsertActivity(userId: number, stravaActivity: any): Promise<Activity> {
  const result = await query(
    `INSERT INTO activities (
      user_id, strava_activity_id, name, distance_meters, moving_time_seconds,
      elapsed_time_seconds, total_elevation_gain_meters, sport_type,
      start_date, start_date_local, timezone, average_speed, max_speed,
      average_heartrate, max_heartrate, average_cadence, calories,
      suffer_score, map_polyline, splits_metric, splits_standard
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (strava_activity_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      distance_meters = EXCLUDED.distance_meters,
      moving_time_seconds = EXCLUDED.moving_time_seconds,
      updated_at = NOW()
    RETURNING *`,
    [
      userId,
      stravaActivity.id,
      stravaActivity.name,
      stravaActivity.distance,
      stravaActivity.moving_time,
      stravaActivity.elapsed_time,
      stravaActivity.total_elevation_gain,
      stravaActivity.type,
      stravaActivity.start_date,
      stravaActivity.start_date_local,
      stravaActivity.timezone,
      stravaActivity.average_speed,
      stravaActivity.max_speed,
      stravaActivity.average_heartrate,
      stravaActivity.max_heartrate,
      stravaActivity.average_cadence,
      stravaActivity.calories,
      stravaActivity.suffer_score,
      stravaActivity.map?.summary_polyline,
      JSON.stringify(stravaActivity.splits_metric),
      JSON.stringify(stravaActivity.splits_standard),
    ]
  );
  return result.rows[0];
}

export async function getActivitiesAfterDate(
  userId: number,
  afterDate: Date
): Promise<Activity[]> {
  const result = await query(
    `SELECT * FROM activities
     WHERE user_id = $1 AND start_date > $2
     ORDER BY start_date DESC`,
    [userId, afterDate]
  );
  return result.rows;
}

export async function getActivityStats(userId: number, days: number = 30): Promise<any> {
  const result = await query(
    `SELECT
       COUNT(*) as total_runs,
       SUM(distance_meters) as total_distance,
       AVG(average_speed) as avg_speed,
       SUM(total_elevation_gain_meters) as total_elevation,
       MAX(distance_meters) as longest_run
     FROM activities
     WHERE user_id = $1 AND start_date >= NOW() - INTERVAL '${days} days'`,
    [userId]
  );
  return result.rows[0];
}

export async function getActivityByIdForUser(
  activityId: number,
  userId: number
): Promise<Activity | null> {
  const result = await query(
    'SELECT * FROM activities WHERE id = $1 AND user_id = $2',
    [activityId, userId]
  );
  return result.rows[0] || null;
}

export async function getActivityInsights(activityId: number): Promise<any | null> {
  const result = await query(
    `SELECT
       pacing_analysis as pacing,
       hr_behavior as "hrBehavior",
       effort_analysis as effort,
       compliance_check as compliance,
       risk_indicators as risks,
       coaching_points as "coachingPoints"
     FROM daily_run_insights
     WHERE activity_id = $1`,
    [activityId]
  );
  return result.rows[0] || null;
}

export async function getLinkedPlannedWorkout(activityId: number): Promise<any | null> {
  // First, try to find by direct link (completed_activity_id)
  const directLink = await query(
    `SELECT
       pw.id,
       pw.name,
       pw.workout_type,
       pw.target_distance_meters,
       pw.target_hr_zone,
       pw.target_pace_min,
       pw.target_pace_max,
       pw.description,
       'direct_link' as match_type
     FROM planned_workouts pw
     WHERE pw.completed_activity_id = $1`,
    [activityId]
  );

  if (directLink.rows[0]) {
    return directLink.rows[0];
  }

  // Fallback: Find workout scheduled for the same day as the activity
  // This handles cases where activities aren't explicitly linked but a workout was planned
  const dateMatch = await query(
    `SELECT
       pw.id,
       pw.name,
       pw.workout_type,
       pw.target_distance_meters,
       pw.target_hr_zone,
       pw.target_pace_min,
       pw.target_pace_max,
       pw.description,
       'date_match' as match_type
     FROM planned_workouts pw
     JOIN training_plans tp ON pw.training_plan_id = tp.id
     JOIN activities a ON a.id = $1
     WHERE tp.user_id = a.user_id
       AND tp.is_active = true
       AND pw.scheduled_date = DATE(a.start_date AT TIME ZONE COALESCE(a.timezone, 'UTC'))
       AND pw.completed_activity_id IS NULL  -- Not already linked to another activity
     ORDER BY
       -- Prefer workouts with similar distance (within 30%)
       CASE
         WHEN pw.target_distance_meters IS NOT NULL
           AND ABS(pw.target_distance_meters - a.distance_meters) / NULLIF(pw.target_distance_meters, 0) < 0.3
         THEN 0
         ELSE 1
       END,
       pw.id ASC
     LIMIT 1`,
    [activityId]
  );

  if (dateMatch.rows[0]) {
    console.log(`📋 Found planned workout by date match for activity ${activityId}: ${dateMatch.rows[0].name}`);
    return dateMatch.rows[0];
  }

  return null;
}
