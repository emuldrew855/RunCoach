/**
 * Action Execution Service
 *
 * Handles the execution of approved pending actions.
 * Implements the actual logic for each tool type (shift, modify, create, delete).
 */

import { query } from '../config/database';
import {
  getPlannedWorkoutById,
  createPlannedWorkout,
} from '../models/PlannedWorkout';
import {
  markActionExecuted,
  markActionFailed,
  getPendingActionById,
} from '../models/PendingAction';

interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

/**
 * Validate action before execution
 */
async function validateAction(
  actionType: string,
  payload: any,
  userId: number
): Promise<{ valid: boolean; error?: string }> {
  // Common validations
  if (actionType === 'shift_workout' || actionType === 'modify_workout' || actionType === 'delete_workout') {
    const workout = await getPlannedWorkoutById(payload.workout_id);

    if (!workout) {
      return { valid: false, error: 'Workout not found' };
    }

    if (workout.user_id !== userId) {
      return { valid: false, error: 'Unauthorized: workout belongs to different user' };
    }
  }

  // Date validations
  if (actionType === 'shift_workout') {
    const newDate = new Date(payload.new_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newDate < today) {
      return { valid: false, error: 'Cannot shift workout to a past date' };
    }

    // Check if date is too far in future (1 year)
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);

    if (newDate > maxDate) {
      return { valid: false, error: 'Cannot shift workout more than 1 year in the future' };
    }
  }

  if (actionType === 'create_workout') {
    const scheduledDate = new Date(payload.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (scheduledDate < today) {
      return { valid: false, error: 'Cannot create workout in the past' };
    }
  }

  // Modification limits
  if (actionType === 'modify_workout' && payload.updates.target_distance_meters) {
    const workout = await getPlannedWorkoutById(payload.workout_id);
    if (workout && workout.target_distance_meters) {
      const changePercent = Math.abs(
        (payload.updates.target_distance_meters - workout.target_distance_meters) /
        workout.target_distance_meters
      );

      if (changePercent > 0.5) {
        return { valid: false, error: 'Distance change cannot exceed 50%' };
      }
    }
  }

  return { valid: true };
}

/**
 * Execute shift_workout action
 */
async function executeShiftWorkout(payload: any, userId: number): Promise<ExecutionResult> {
  const { workout_id, new_date, reason } = payload;

  const validation = await validateAction('shift_workout', payload, userId);
  if (!validation.valid) {
    return { success: false, message: 'Validation failed', error: validation.error };
  }

  try {
    const result = await query(
      `UPDATE planned_workouts
       SET scheduled_date = $1,
           coach_notes = COALESCE(coach_notes, '') || E'\\n[Agent Shift] ' || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [new_date, reason, workout_id, userId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Failed to shift workout', error: 'Workout not found or unauthorized' };
    }

    return {
      success: true,
      message: `Workout shifted to ${new_date}`,
      data: result.rows[0],
    };
  } catch (error: any) {
    return { success: false, message: 'Execution error', error: error.message };
  }
}

/**
 * Execute modify_workout action
 */
async function executeModifyWorkout(payload: any, userId: number): Promise<ExecutionResult> {
  const { workout_id, updates, reason } = payload;

  const validation = await validateAction('modify_workout', payload, userId);
  if (!validation.valid) {
    return { success: false, message: 'Validation failed', error: validation.error };
  }

  try {
    // Build dynamic UPDATE query based on provided updates
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (updates.target_distance_meters !== undefined) {
      updateFields.push(`target_distance_meters = $${paramIndex++}`);
      updateValues.push(updates.target_distance_meters);
    }

    if (updates.target_duration_seconds !== undefined) {
      updateFields.push(`target_duration_seconds = $${paramIndex++}`);
      updateValues.push(updates.target_duration_seconds);
    }

    if (updates.target_hr_zone !== undefined) {
      updateFields.push(`target_hr_zone = $${paramIndex++}`);
      updateValues.push(updates.target_hr_zone);
    }

    if (updates.target_pace_min !== undefined) {
      updateFields.push(`target_pace_min = $${paramIndex++}`);
      updateValues.push(updates.target_pace_min);
    }

    if (updates.target_pace_max !== undefined) {
      updateFields.push(`target_pace_max = $${paramIndex++}`);
      updateValues.push(updates.target_pace_max);
    }

    if (updates.target_pace_avg !== undefined) {
      updateFields.push(`target_pace_avg = $${paramIndex++}`);
      updateValues.push(updates.target_pace_avg);
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(updates.description);
    }

    // Always update coach_notes with reason
    updateFields.push(`coach_notes = COALESCE(coach_notes, '') || $${paramIndex++}`);
    updateValues.push(`\n[Agent Modification] ${reason}`);

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    // Add WHERE clause parameters
    updateValues.push(workout_id, userId);

    const sql = `
      UPDATE planned_workouts
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await query(sql, updateValues);

    if (result.rows.length === 0) {
      return { success: false, message: 'Failed to modify workout', error: 'Workout not found or unauthorized' };
    }

    return {
      success: true,
      message: 'Workout modified successfully',
      data: result.rows[0],
    };
  } catch (error: any) {
    return { success: false, message: 'Execution error', error: error.message };
  }
}

/**
 * Execute create_workout action
 */
async function executeCreateWorkout(payload: any, userId: number): Promise<ExecutionResult> {
  const validation = await validateAction('create_workout', payload, userId);
  if (!validation.valid) {
    return { success: false, message: 'Validation failed', error: validation.error };
  }

  try {
    // Get user's active training plan
    const planResult = await query(
      'SELECT id FROM training_plans WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (planResult.rows.length === 0) {
      return { success: false, message: 'No active training plan found', error: 'User has no active training plan' };
    }

    const trainingPlanId = planResult.rows[0].id;

    // Create the workout
    const workout = await createPlannedWorkout({
      training_plan_id: trainingPlanId,
      user_id: userId,
      scheduled_date: new Date(payload.scheduled_date),
      workout_type: payload.workout_type,
      name: payload.name,
      description: payload.description,
      target_distance_meters: payload.target_distance_meters,
      target_duration_seconds: payload.target_duration_seconds,
      target_hr_zone: payload.target_hr_zone,
      target_pace_min: payload.target_pace_min,
      target_pace_max: payload.target_pace_max,
      target_hr_min: undefined,
      target_hr_max: undefined,
      intervals: undefined,
      coach_notes: `[Agent Created] ${payload.reason}`,
      athlete_notes: undefined,
      completion_status: 'pending',
      completed_activity_id: undefined,
    });

    return {
      success: true,
      message: 'Workout created successfully',
      data: workout,
    };
  } catch (error: any) {
    return { success: false, message: 'Execution error', error: error.message };
  }
}

/**
 * Execute delete_workout action
 */
async function executeDeleteWorkout(payload: any, userId: number): Promise<ExecutionResult> {
  const { workout_id, reason } = payload;

  const validation = await validateAction('delete_workout', payload, userId);
  if (!validation.valid) {
    return { success: false, message: 'Validation failed', error: validation.error };
  }

  try {
    // Store workout data before deletion for audit trail
    const workout = await getPlannedWorkoutById(workout_id);

    if (!workout) {
      return { success: false, message: 'Workout not found', error: 'Workout does not exist' };
    }

    const result = await query(
      'DELETE FROM planned_workouts WHERE id = $1 AND user_id = $2 RETURNING *',
      [workout_id, userId]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Failed to delete workout', error: 'Workout not found or unauthorized' };
    }

    // Log to action_history
    await query(
      `INSERT INTO action_history (
        user_id, action_type, action_payload, original_state, status, result, initiated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        'delete_workout',
        JSON.stringify({ workout_id, reason }),
        JSON.stringify(workout),
        'success',
        JSON.stringify({ deleted: true }),
        'agent',
      ]
    );

    return {
      success: true,
      message: 'Workout deleted successfully',
      data: { deleted: true, workout_id },
    };
  } catch (error: any) {
    return { success: false, message: 'Execution error', error: error.message };
  }
}

/**
 * Main execution dispatcher
 */
export async function executeAction(actionId: string, userId: number): Promise<ExecutionResult> {
  const action = await getPendingActionById(actionId);

  if (!action) {
    return { success: false, message: 'Action not found', error: 'Invalid action ID' };
  }

  if (action.user_id !== userId) {
    return { success: false, message: 'Unauthorized', error: 'Action belongs to different user' };
  }

  if (action.status !== 'approved') {
    return { success: false, message: 'Action not approved', error: `Action status is ${action.status}` };
  }

  let result: ExecutionResult;

  switch (action.action_type) {
    case 'shift_workout':
      result = await executeShiftWorkout(action.action_payload, userId);
      break;

    case 'modify_workout':
      result = await executeModifyWorkout(action.action_payload, userId);
      break;

    case 'create_workout':
      result = await executeCreateWorkout(action.action_payload, userId);
      break;

    case 'delete_workout':
      result = await executeDeleteWorkout(action.action_payload, userId);
      break;

    default:
      result = {
        success: false,
        message: 'Unknown action type',
        error: `Unsupported action: ${action.action_type}`,
      };
  }

  // Update action status in database
  if (result.success) {
    await markActionExecuted(actionId, result.data);

    // Log to action_history
    await query(
      `INSERT INTO action_history (
        user_id, action_type, action_payload, status, result, initiated_by, agent_conversation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action.action_type,
        action.action_payload,
        'success',
        JSON.stringify(result.data),
        'agent',
        action.conversation_id,
      ]
    );
  } else {
    await markActionFailed(actionId, result.error || 'Unknown error');

    // Log failure to action_history
    await query(
      `INSERT INTO action_history (
        user_id, action_type, action_payload, status, error_message, initiated_by, agent_conversation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action.action_type,
        action.action_payload,
        'failed',
        result.error,
        'agent',
        action.conversation_id,
      ]
    );
  }

  return result;
}

/**
 * Rate limiting check
 */
export async function checkRateLimit(userId: number): Promise<{ allowed: boolean; message?: string }> {
  // Check max pending actions (5)
  const pendingResult = await query(
    'SELECT COUNT(*) as count FROM pending_actions WHERE user_id = $1 AND status = $2',
    [userId, 'pending']
  );

  const pendingCount = parseInt(pendingResult.rows[0].count);
  if (pendingCount >= 5) {
    return {
      allowed: false,
      message: 'Maximum of 5 pending actions reached. Please approve or reject existing actions first.',
    };
  }

  // Check actions in last hour (10)
  const hourlyResult = await query(
    `SELECT COUNT(*) as count FROM action_history
     WHERE user_id = $1
     AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    [userId]
  );

  const hourlyCount = parseInt(hourlyResult.rows[0].count);
  if (hourlyCount >= 10) {
    return {
      allowed: false,
      message: 'Maximum of 10 actions per hour reached. Please try again later.',
    };
  }

  return { allowed: true };
}
