import { query } from '../config/database';
import { RaceHistory } from '../types/models';

export async function getRaceHistoryByUserId(userId: number): Promise<RaceHistory[]> {
  const result = await query(
    `SELECT * FROM race_history
     WHERE user_id = $1
     ORDER BY race_date DESC`,
    [userId]
  );
  return result.rows;
}

export async function getRaceHistoryById(id: number, userId: number): Promise<RaceHistory | null> {
  const result = await query(
    'SELECT * FROM race_history WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function createRaceHistory(raceData: Omit<RaceHistory, 'id' | 'created_at' | 'updated_at'>): Promise<RaceHistory> {
  const result = await query(
    `INSERT INTO race_history (
      user_id, race_name, race_date, race_type, finish_time_seconds,
      race_location, race_notes, is_personal_best, placement,
      age_group_placement, weather_conditions, elevation_gain_meters
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      raceData.user_id,
      raceData.race_name,
      raceData.race_date,
      raceData.race_type,
      raceData.finish_time_seconds,
      raceData.race_location || null,
      raceData.race_notes || null,
      raceData.is_personal_best || false,
      raceData.placement || null,
      raceData.age_group_placement || null,
      raceData.weather_conditions || null,
      raceData.elevation_gain_meters || null,
    ]
  );
  return result.rows[0];
}

export async function updateRaceHistory(
  id: number,
  userId: number,
  updates: Partial<RaceHistory>
): Promise<RaceHistory | null> {
  const result = await query(
    `UPDATE race_history
     SET race_name = COALESCE($3, race_name),
         race_date = COALESCE($4, race_date),
         race_type = COALESCE($5, race_type),
         finish_time_seconds = COALESCE($6, finish_time_seconds),
         race_location = COALESCE($7, race_location),
         race_notes = COALESCE($8, race_notes),
         is_personal_best = COALESCE($9, is_personal_best),
         placement = COALESCE($10, placement),
         age_group_placement = COALESCE($11, age_group_placement),
         weather_conditions = COALESCE($12, weather_conditions),
         elevation_gain_meters = COALESCE($13, elevation_gain_meters),
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      updates.race_name,
      updates.race_date,
      updates.race_type,
      updates.finish_time_seconds,
      updates.race_location,
      updates.race_notes,
      updates.is_personal_best,
      updates.placement,
      updates.age_group_placement,
      updates.weather_conditions,
      updates.elevation_gain_meters,
    ]
  );
  return result.rows[0] || null;
}

export async function deleteRaceHistory(id: number, userId: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM race_history WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function getPersonalBests(userId: number): Promise<RaceHistory[]> {
  const result = await query(
    `SELECT * FROM race_history
     WHERE user_id = $1 AND is_personal_best = true
     ORDER BY race_type, finish_time_seconds ASC`,
    [userId]
  );
  return result.rows;
}
