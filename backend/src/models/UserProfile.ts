import { query } from '../config/database';
import { UserProfile } from '../types/models';

export async function getProfileByUserId(userId: number): Promise<UserProfile | null> {
  const result = await query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function upsertProfile(profile: Partial<UserProfile> & { user_id: number }): Promise<UserProfile> {
  const result = await query(
    `INSERT INTO user_profiles (
      user_id, age, weight_kg, height_cm, gender, running_experience_years,
      typical_weekly_mileage, injury_history, preferred_units, week_starts_on, timezone,
      training_block_start, training_block_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (user_id)
    DO UPDATE SET
      age = COALESCE(EXCLUDED.age, user_profiles.age),
      weight_kg = COALESCE(EXCLUDED.weight_kg, user_profiles.weight_kg),
      height_cm = COALESCE(EXCLUDED.height_cm, user_profiles.height_cm),
      gender = COALESCE(EXCLUDED.gender, user_profiles.gender),
      running_experience_years = COALESCE(EXCLUDED.running_experience_years, user_profiles.running_experience_years),
      typical_weekly_mileage = COALESCE(EXCLUDED.typical_weekly_mileage, user_profiles.typical_weekly_mileage),
      injury_history = COALESCE(EXCLUDED.injury_history, user_profiles.injury_history),
      preferred_units = COALESCE(EXCLUDED.preferred_units, user_profiles.preferred_units),
      week_starts_on = COALESCE(EXCLUDED.week_starts_on, user_profiles.week_starts_on),
      timezone = COALESCE(EXCLUDED.timezone, user_profiles.timezone),
      training_block_start = COALESCE(EXCLUDED.training_block_start, user_profiles.training_block_start),
      training_block_end = COALESCE(EXCLUDED.training_block_end, user_profiles.training_block_end),
      updated_at = NOW()
    RETURNING *`,
    [
      profile.user_id,
      profile.age,
      profile.weight_kg,
      profile.height_cm,
      profile.gender,
      profile.running_experience_years,
      profile.typical_weekly_mileage,
      profile.injury_history,
      profile.preferred_units || 'metric',
      profile.week_starts_on || 'sunday',
      profile.timezone || 'UTC',
      profile.training_block_start,
      profile.training_block_end,
    ]
  );
  return result.rows[0];
}
