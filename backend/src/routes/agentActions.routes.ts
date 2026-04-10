import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as PendingActionModel from '../models/PendingAction';
import * as PlannedWorkoutModel from '../models/PlannedWorkout';
import { getProfileByUserId } from '../models/UserProfile';
import pool from '../config/database';

const router = Router();

/**
 * GET /pending
 * Get all pending actions for the current user
 */
router.get('/pending', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const actions = await PendingActionModel.getPendingActionsByUser(userId, 'pending');
    res.json({ success: true, data: { actions } });
  } catch (error: any) {
    console.error('Failed to get pending actions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /create
 * Create a new pending action (called by agent service)
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { user_id, conversation_id, message_id, action_type, action_payload, agent_reasoning } = req.body;

    // Validate required fields
    if (!user_id || !conversation_id || !action_type || !action_payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, conversation_id, action_type, action_payload',
      });
    }

    const action = await PendingActionModel.createPendingAction({
      user_id,
      conversation_id,
      message_id,
      action_type,
      action_payload,
      agent_reasoning,
    });

    res.json({ success: true, data: { action } });
  } catch (error: any) {
    console.error('Failed to create pending action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:actionId/approve
 * Approve and execute a pending action
 */
router.post('/:actionId/approve', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { actionId } = req.params;

    // Get the action
    const action = await PendingActionModel.getPendingActionById(actionId);

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    // Verify ownership
    if (action.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to approve this action' });
    }

    if (action.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Action already ${action.status}` });
    }

    // Approve the action first
    const approvedAction = await PendingActionModel.approvePendingAction(actionId, userId);

    if (!approvedAction) {
      return res.status(500).json({ success: false, error: 'Failed to approve action' });
    }

    // Execute the action based on type
    let result;
    try {
      switch (action.action_type) {
        case 'modify_workout':
          result = await PlannedWorkoutModel.updatePlannedWorkout(
            action.action_payload.workoutId,
            action.action_payload.updates
          );
          await PendingActionModel.markActionExecuted(actionId, result);
          break;

        case 'bulk_modify_workouts':
          // Will implement in Phase 3
          throw new Error('Bulk modifications not yet implemented');

        case 'create_workout':
          result = await PlannedWorkoutModel.createPlannedWorkout(action.action_payload);
          await PendingActionModel.markActionExecuted(actionId, result);
          break;

        case 'delete_workout':
          await PlannedWorkoutModel.deletePlannedWorkout(action.action_payload.workoutId);
          result = { deleted: true };
          await PendingActionModel.markActionExecuted(actionId, result);
          break;

        case 'shift_workout':
          result = await PlannedWorkoutModel.updatePlannedWorkout(
            action.action_payload.workoutId,
            { scheduled_date: action.action_payload.newDate }
          );
          await PendingActionModel.markActionExecuted(actionId, result);
          break;

        case 'swap_training_weeks': {
          // Get user's week_starts_on preference
          const profile = await getProfileByUserId(userId);
          const weekStartsOn = profile?.week_starts_on || 'sunday';

          const week1Start = new Date(action.action_payload.week1_start_date);
          const week2Start = new Date(action.action_payload.week2_start_date);

          // Calculate week end dates (6 days after start)
          const week1End = new Date(week1Start);
          week1End.setDate(week1End.getDate() + 6);

          const week2End = new Date(week2Start);
          week2End.setDate(week2End.getDate() + 6);

          // Get all workouts in both weeks
          const week1Workouts = await pool.query(
            `SELECT * FROM planned_workouts
             WHERE user_id = $1
             AND scheduled_date >= $2
             AND scheduled_date <= $3
             AND completion_status != 'completed'
             ORDER BY scheduled_date`,
            [userId, week1Start.toISOString().split('T')[0], week1End.toISOString().split('T')[0]]
          );

          const week2Workouts = await pool.query(
            `SELECT * FROM planned_workouts
             WHERE user_id = $1
             AND scheduled_date >= $2
             AND scheduled_date <= $3
             AND completion_status != 'completed'
             ORDER BY scheduled_date`,
            [userId, week2Start.toISOString().split('T')[0], week2End.toISOString().split('T')[0]]
          );

          // Swap workouts: move week1 workouts to week2 and vice versa
          const swappedWorkouts = [];

          // Move week 1 workouts to week 2 (preserve day of week)
          for (const workout of week1Workouts.rows) {
            const oldDate = new Date(workout.scheduled_date);
            const dayOffset = Math.floor((oldDate.getTime() - week1Start.getTime()) / (24 * 60 * 60 * 1000));

            const newDate = new Date(week2Start);
            newDate.setDate(newDate.getDate() + dayOffset);

            await PlannedWorkoutModel.updatePlannedWorkout(workout.id, {
              scheduled_date: newDate.toISOString().split('T')[0]
            });

            swappedWorkouts.push({
              id: workout.id,
              name: workout.name,
              from: workout.scheduled_date,
              to: newDate.toISOString().split('T')[0]
            });
          }

          // Move week 2 workouts to week 1 (preserve day of week)
          for (const workout of week2Workouts.rows) {
            const oldDate = new Date(workout.scheduled_date);
            const dayOffset = Math.floor((oldDate.getTime() - week2Start.getTime()) / (24 * 60 * 60 * 1000));

            const newDate = new Date(week1Start);
            newDate.setDate(newDate.getDate() + dayOffset);

            await PlannedWorkoutModel.updatePlannedWorkout(workout.id, {
              scheduled_date: newDate.toISOString().split('T')[0]
            });

            swappedWorkouts.push({
              id: workout.id,
              name: workout.name,
              from: workout.scheduled_date,
              to: newDate.toISOString().split('T')[0]
            });
          }

          result = {
            swapped: true,
            week1Start: week1Start.toISOString().split('T')[0],
            week2Start: week2Start.toISOString().split('T')[0],
            workoutsSwapped: swappedWorkouts.length,
            details: swappedWorkouts
          };

          await PendingActionModel.markActionExecuted(actionId, result);
          break;
        }

        default:
          throw new Error(`Unknown action type: ${action.action_type}`);
      }

      res.json({ success: true, data: { result, action: approvedAction } });
    } catch (executionError: any) {
      // Mark action as failed
      await PendingActionModel.markActionFailed(actionId, executionError.message);
      throw executionError;
    }
  } catch (error: any) {
    console.error('Failed to approve action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:actionId/reject
 * Reject a pending action
 */
router.post('/:actionId/reject', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { actionId } = req.params;
    const { reason } = req.body;

    const action = await PendingActionModel.rejectPendingAction(actionId, userId, reason);

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found or already processed' });
    }

    res.json({ success: true, data: { action } });
  } catch (error: any) {
    console.error('Failed to reject action:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /count
 * Get count of pending actions for badge display
 */
router.get('/count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await PendingActionModel.countPendingActions(userId);
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    console.error('Failed to get pending actions count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
