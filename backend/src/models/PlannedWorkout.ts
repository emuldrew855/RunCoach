import { query } from '../config/database';
import { PlannedWorkout } from '../types/models';

export async function getPlannedWorkoutsByPlan(planId: number): Promise<PlannedWorkout[]> {
  const result = await query(
    'SELECT * FROM planned_workouts WHERE training_plan_id = $1 ORDER BY scheduled_date ASC',
    [planId]
  );
  return result.rows;
}

export async function getPlannedWorkoutsByDateRange(
  userId: number,
  startDate: Date,
  endDate: Date
): Promise<PlannedWorkout[]> {
  const result = await query(
    `SELECT pw.* FROM planned_workouts pw
     INNER JOIN training_plans tp ON pw.training_plan_id = tp.id
     WHERE pw.user_id = $1
     AND pw.scheduled_date BETWEEN $2 AND $3
     AND tp.is_active = true
     ORDER BY pw.scheduled_date ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

export async function getUpcomingWorkouts(userId: number, days: number = 7): Promise<PlannedWorkout[]> {
  const result = await query(
    `SELECT pw.* FROM planned_workouts pw
     INNER JOIN training_plans tp ON pw.training_plan_id = tp.id
     WHERE pw.user_id = $1
     AND pw.scheduled_date >= CURRENT_DATE
     AND pw.scheduled_date <= CURRENT_DATE + INTERVAL '${days} days'
     AND pw.completion_status != 'completed'
     AND tp.is_active = true
     ORDER BY pw.scheduled_date ASC`,
    [userId]
  );
  return result.rows;
}

export async function getPlannedWorkoutById(id: number): Promise<PlannedWorkout | null> {
  const result = await query(
    'SELECT * FROM planned_workouts WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPlannedWorkout(
  workout: Omit<PlannedWorkout, 'id' | 'created_at' | 'updated_at'>
): Promise<PlannedWorkout> {
  const result = await query(
    `INSERT INTO planned_workouts (
      training_plan_id, user_id, scheduled_date, workout_type, name, description,
      target_distance_meters, target_duration_seconds, target_pace_min, target_pace_max, target_pace_avg,
      target_hr_zone, target_hr_min, target_hr_max, intervals, coach_notes, athlete_notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      workout.training_plan_id,
      workout.user_id,
      workout.scheduled_date,
      workout.workout_type,
      workout.name,
      workout.description,
      workout.target_distance_meters,
      workout.target_duration_seconds,
      workout.target_pace_min,
      workout.target_pace_max,
      (workout as any).target_pace_avg,
      workout.target_hr_zone,
      workout.target_hr_min,
      workout.target_hr_max,
      workout.intervals ? JSON.stringify(workout.intervals) : null,
      workout.coach_notes,
      workout.athlete_notes,
    ]
  );
  return result.rows[0];
}

export async function bulkCreatePlannedWorkouts(
  workouts: Omit<PlannedWorkout, 'id' | 'created_at' | 'updated_at'>[]
): Promise<PlannedWorkout[]> {
  if (workouts.length === 0) {
    return [];
  }

  // Build batch insert query
  const placeholders = workouts.map((_, idx) => {
    const base = idx * 17;
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13}, $${base+14}, $${base+15}, $${base+16}, $${base+17})`;
  }).join(', ');

  const values = workouts.flatMap(w => [
    w.training_plan_id,
    w.user_id,
    w.scheduled_date,
    w.workout_type,
    w.name,
    w.description,
    w.target_distance_meters,
    w.target_duration_seconds,
    w.target_pace_min,
    w.target_pace_max,
    (w as any).target_pace_avg,
    w.target_hr_zone,
    w.target_hr_min,
    w.target_hr_max,
    w.intervals ? JSON.stringify(w.intervals) : null,
    w.coach_notes,
    w.athlete_notes,
  ]);

  const result = await query(
    `INSERT INTO planned_workouts (
      training_plan_id, user_id, scheduled_date, workout_type, name, description,
      target_distance_meters, target_duration_seconds, target_pace_min, target_pace_max, target_pace_avg,
      target_hr_zone, target_hr_min, target_hr_max, intervals, coach_notes, athlete_notes
    ) VALUES ${placeholders} RETURNING *`,
    values
  );
  return result.rows;
}

export async function updatePlannedWorkout(
  id: number,
  updates: Partial<PlannedWorkout>
): Promise<PlannedWorkout> {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      // Handle JSONB serialization for intervals
      values.push(key === 'intervals' ? JSON.stringify(value) : value);
      paramCount++;
    }
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE planned_workouts SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
}

export async function markWorkoutCompleted(
  workoutId: number,
  activityId: number,
  status: string = 'completed'
): Promise<PlannedWorkout> {
  const result = await query(
    `UPDATE planned_workouts
     SET completed_activity_id = $1, completion_status = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [activityId, status, workoutId]
  );
  return result.rows[0];
}

export async function deletePlannedWorkout(id: number): Promise<void> {
  await query('DELETE FROM planned_workouts WHERE id = $1', [id]);
}
