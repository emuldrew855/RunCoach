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
