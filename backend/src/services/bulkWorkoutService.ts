/**
 * Bulk Workout Modification Service
 *
 * Handles bulk modifications to multiple workouts matching specific criteria.
 * Provides preview functionality and safe execution with validation.
 */

import { query } from '../config/database';
import { PlannedWorkout } from '../types/models';

export interface BulkModificationCriteria {
  workout_types?: string[];
  date_range?: {
    start_date: string;
    end_date: string;
  };
  days_from_now?: {
    min?: number;
    max?: number;
  };
  exclude_completed?: boolean;
  limit?: number;
}

export interface BulkModificationPreview {
  matchedWorkouts: PlannedWorkout[];
  affectedCount: number;
  affectedDates: string[];
  summary: string;
}

/**
 * Find workouts matching the given criteria
 */
export async function findMatchingWorkouts(
  userId: number,
  criteria: BulkModificationCriteria
): Promise<PlannedWorkout[]> {
  const whereClauses: string[] = ['user_id = $1'];
  const params: any[] = [userId];
  let paramIndex = 2;

  // Always exclude completed workouts by default for safety
  if (criteria.exclude_completed !== false) {
    whereClauses.push(`completion_status != 'completed'`);
  }

  // Workout types filter
  if (criteria.workout_types && criteria.workout_types.length > 0) {
    whereClauses.push(`workout_type = ANY($${paramIndex})`);
    params.push(criteria.workout_types);
    paramIndex++;
  }

  // Date range filter (absolute dates)
  if (criteria.date_range) {
    whereClauses.push(`scheduled_date >= $${paramIndex}`);
    params.push(criteria.date_range.start_date);
    paramIndex++;

    whereClauses.push(`scheduled_date <= $${paramIndex}`);
    params.push(criteria.date_range.end_date);
    paramIndex++;
  }

  // Relative days filter (from today)
  if (criteria.days_from_now) {
    if (criteria.days_from_now.min !== undefined) {
      whereClauses.push(`scheduled_date >= CURRENT_DATE + INTERVAL '${criteria.days_from_now.min} days'`);
    }
    if (criteria.days_from_now.max !== undefined) {
      whereClauses.push(`scheduled_date <= CURRENT_DATE + INTERVAL '${criteria.days_from_now.max} days'`);
    }
  }

  // Safety limit - cap at 100 workouts max
  const limit = Math.min(criteria.limit || 50, 100);

  const sql = `
    SELECT * FROM planned_workouts
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY scheduled_date ASC
    LIMIT ${limit}
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Preview bulk modification before execution
 */
export async function previewBulkModification(
  userId: number,
  criteria: BulkModificationCriteria,
  updates: Partial<PlannedWorkout>
): Promise<BulkModificationPreview> {
  const matchedWorkouts = await findMatchingWorkouts(userId, criteria);

  if (matchedWorkouts.length === 0) {
    return {
      matchedWorkouts: [],
      affectedCount: 0,
      affectedDates: [],
      summary: 'No workouts match the specified criteria',
    };
  }

  // Extract unique dates sorted
  const affectedDates = [...new Set(
    matchedWorkouts.map(w => {
      const date = new Date(w.scheduled_date);
      return date.toISOString().split('T')[0];
    })
  )].sort();

  // Build summary
  const workoutTypesList = criteria.workout_types?.join(', ') || 'any type';
  const dateRangeStr = affectedDates.length > 0
    ? `${affectedDates[0]} to ${affectedDates[affectedDates.length - 1]}`
    : 'unknown range';

  const summary = `Will modify ${matchedWorkouts.length} workout(s) (${workoutTypesList}) from ${dateRangeStr}`;

  return {
    matchedWorkouts,
    affectedCount: matchedWorkouts.length,
    affectedDates,
    summary,
  };
}

/**
 * Execute bulk modification on specified workouts
 */
export async function executeBulkModification(
  userId: number,
  workoutIds: number[],
  updates: Partial<PlannedWorkout>
): Promise<{ updatedCount: number; updatedWorkouts: PlannedWorkout[] }> {
  if (workoutIds.length === 0) {
    return { updatedCount: 0, updatedWorkouts: [] };
  }

  // Build dynamic UPDATE query
  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let valueIndex = 3; // Start after userId and workoutIds array

  // Map update fields to SQL
  const fieldMapping: { [key: string]: string } = {
    target_distance_meters: 'target_distance_meters',
    target_duration_seconds: 'target_duration_seconds',
    target_pace_min: 'target_pace_min',
    target_pace_max: 'target_pace_max',
    target_pace_avg: 'target_pace_avg',
    target_hr_zone: 'target_hr_zone',
    target_hr_min: 'target_hr_min',
    target_hr_max: 'target_hr_max',
    workout_type: 'workout_type',
    name: 'name',
    description: 'description',
    coach_notes: 'coach_notes',
    intervals: 'intervals',
  };

  for (const [key, dbColumn] of Object.entries(fieldMapping)) {
    const value = (updates as any)[key];
    if (value !== undefined) {
      updateFields.push(`${dbColumn} = $${valueIndex}`);

      // Special handling for JSONB column
      if (key === 'intervals') {
        updateValues.push(value ? JSON.stringify(value) : null);
      } else {
        updateValues.push(value);
      }

      valueIndex++;
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid update fields provided');
  }

  // Add updated_at timestamp
  updateFields.push('updated_at = NOW()');

  const sql = `
    UPDATE planned_workouts
    SET ${updateFields.join(', ')}
    WHERE user_id = $1
      AND id = ANY($2)
      AND completion_status != 'completed'
    RETURNING *
  `;

  const result = await query(sql, [userId, workoutIds, ...updateValues]);

  return {
    updatedCount: result.rowCount || 0,
    updatedWorkouts: result.rows,
  };
}

/**
 * Validate bulk modification criteria
 */
export function validateBulkCriteria(criteria: BulkModificationCriteria): string | null {
  // Must have at least one filter criteria
  if (
    !criteria.workout_types?.length &&
    !criteria.date_range &&
    !criteria.days_from_now
  ) {
    return 'Must specify at least one criteria (workout types, date range, or relative days)';
  }

  // Validate date range format
  if (criteria.date_range) {
    const { start_date, end_date } = criteria.date_range;
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return 'Invalid date format. Use YYYY-MM-DD';
    }

    if (endDate < startDate) {
      return 'End date must be after start date';
    }
  }

  // Validate days_from_now
  if (criteria.days_from_now) {
    const { min, max } = criteria.days_from_now;
    if (min !== undefined && max !== undefined && max < min) {
      return 'Maximum days must be greater than minimum days';
    }
  }

  // Validate workout types
  const validTypes = ['easy', 'long_run', 'tempo', 'intervals', 'recovery', 'race', 'rest'];
  if (criteria.workout_types) {
    const invalidTypes = criteria.workout_types.filter(type => !validTypes.includes(type));
    if (invalidTypes.length > 0) {
      return `Invalid workout types: ${invalidTypes.join(', ')}`;
    }
  }

  return null;
}
