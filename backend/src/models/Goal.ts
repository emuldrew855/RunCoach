import { query } from '../config/database';
import { Goal } from '../types/models';

export async function getGoalsByUserId(userId: number): Promise<Goal[]> {
  const result = await query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

export async function getActiveGoal(userId: number): Promise<Goal | null> {
  const result = await query(
    'SELECT * FROM goals WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function createGoal(goal: Omit<Goal, 'id' | 'created_at' | 'updated_at'>): Promise<Goal> {
  const result = await query(
    `INSERT INTO goals (user_id, goal_type, target_time_seconds, target_date, race_name, race_location, is_active, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      goal.user_id,
      goal.goal_type,
      goal.target_time_seconds,
      goal.target_date,
      goal.race_name,
      goal.race_location,
      goal.is_active,
      goal.notes,
    ]
  );
  return result.rows[0];
}

export async function updateGoal(id: number, updates: Partial<Goal>): Promise<Goal> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  // Exclude fields that should not be updated directly
  const excludedFields = ['id', 'created_at', 'updated_at'];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && !excludedFields.includes(key)) {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  // Always set updated_at to NOW()
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE goals SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}
