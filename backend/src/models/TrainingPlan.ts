import { query } from '../config/database';
import { TrainingPlan } from '../types/models';

export async function getTrainingPlansByUserId(userId: number): Promise<TrainingPlan[]> {
  const result = await query(
    'SELECT * FROM training_plans WHERE user_id = $1 ORDER BY start_date DESC',
    [userId]
  );
  return result.rows;
}

export async function getActivePlan(userId: number): Promise<TrainingPlan | null> {
  const result = await query(
    'SELECT * FROM training_plans WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getTrainingPlanById(id: number): Promise<TrainingPlan | null> {
  const result = await query(
    'SELECT * FROM training_plans WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createTrainingPlan(plan: Omit<TrainingPlan, 'id' | 'created_at' | 'updated_at'>): Promise<TrainingPlan> {
  const result = await query(
    `INSERT INTO training_plans (
      user_id, goal_id, name, description, start_date, end_date,
      total_weeks, source, file_metadata, is_active,
      identify_peaks, peak_weeks_count, peak_week_numbers, taper_weeks, taper_start_date, enable_carb_loading
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      plan.user_id,
      plan.goal_id,
      plan.name,
      plan.description,
      plan.start_date,
      plan.end_date,
      plan.total_weeks,
      plan.source,
      plan.file_metadata ? JSON.stringify(plan.file_metadata) : null,
      plan.is_active,
      plan.identify_peaks ?? false,
      plan.peak_weeks_count ?? 1,
      plan.peak_week_numbers ?? [],
      plan.taper_weeks ?? 2,
      plan.taper_start_date ?? null,
      plan.enable_carb_loading ?? false,
    ]
  );
  return result.rows[0];
}

export async function updateTrainingPlan(id: number, updates: Partial<TrainingPlan>): Promise<TrainingPlan> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      // Handle JSONB serialization for file_metadata
      values.push(key === 'file_metadata' ? JSON.stringify(value) : value);
      paramCount++;
    }
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE training_plans SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function deleteTrainingPlan(id: number): Promise<void> {
  await query('DELETE FROM training_plans WHERE id = $1', [id]);
}

export async function deactivateOtherPlans(userId: number, exceptPlanId?: number): Promise<void> {
  const sql = exceptPlanId
    ? 'UPDATE training_plans SET is_active = false WHERE user_id = $1 AND id != $2'
    : 'UPDATE training_plans SET is_active = false WHERE user_id = $1';

  const params = exceptPlanId ? [userId, exceptPlanId] : [userId];
  await query(sql, params);
}
