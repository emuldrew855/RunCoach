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
      training_block_start, training_block_end, coach_style, coach_strictness_level, coach_communication_style,
      chart_preferences, personal_bests
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
      coach_style = COALESCE(EXCLUDED.coach_style, user_profiles.coach_style),
      coach_strictness_level = COALESCE(EXCLUDED.coach_strictness_level, user_profiles.coach_strictness_level),
      coach_communication_style = COALESCE(EXCLUDED.coach_communication_style, user_profiles.coach_communication_style),
      chart_preferences = COALESCE(EXCLUDED.chart_preferences, user_profiles.chart_preferences),
      personal_bests = COALESCE(EXCLUDED.personal_bests, user_profiles.personal_bests),
      updated_at = NOW()
    RETURNING *`,
    [
      profile.user_id,
      profile.age ?? null,
      profile.weight_kg ?? null,
      profile.height_cm ?? null,
      profile.gender ?? null,
      profile.running_experience_years ?? null,
      profile.typical_weekly_mileage ?? null,
      profile.injury_history ?? null,
      profile.preferred_units ?? 'metric',
      profile.week_starts_on ?? 'sunday',
      profile.timezone ?? 'UTC',
      profile.training_block_start ?? null,
      profile.training_block_end ?? null,
      profile.coach_style ?? null,
      profile.coach_strictness_level ?? null,
      profile.coach_communication_style ?? null,
      profile.chart_preferences ? JSON.stringify(profile.chart_preferences) : null,
      profile.personal_bests ? JSON.stringify(profile.personal_bests) : null,
    ]
  );
  return result.rows[0];
}
