/**
 * Agent Action Controller
 *
 * Handles HTTP requests for pending action approval, rejection, and status queries.
 */

import { Request, Response } from 'express';
import {
  getPendingActionById,
  getPendingActionsByUser,
  approvePendingAction,
  rejectPendingAction,
  countPendingActions,
} from '../models/PendingAction';
import { executeAction } from '../services/actionExecutionService';

/**
 * GET /api/agent/actions/pending
 * Get all pending actions for the authenticated user
 */
export async function getPendingActions(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const actions = await getPendingActionsByUser(userId, 'pending');

    return res.json({
      actions,
      count: actions.length,
    });
  } catch (error: any) {
    console.error('Error fetching pending actions:', error);
    return res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
}

/**
 * GET /api/agent/actions/:actionId
 * Get a specific pending action by ID
 */
export async function getPendingAction(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const action = await getPendingActionById(actionId);

    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    if (action.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized: action belongs to different user' });
    }

    return res.json({ action });
  } catch (error: any) {
    console.error('Error fetching pending action:', error);
    return res.status(500).json({ error: 'Failed to fetch pending action' });
  }
}

/**
 * POST /api/agent/actions/:actionId/approve
 * Approve a pending action and execute it
 */
export async function approveAction(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Approve the action
    const approvedAction = await approvePendingAction(actionId, userId);

    if (!approvedAction) {
      return res.status(404).json({
        error: 'Action not found or already processed',
      });
    }

    // Execute the action
    const executionResult = await executeAction(actionId, userId);

    return res.json({
      action: approvedAction,
      execution: executionResult,
      message: executionResult.success
        ? 'Action approved and executed successfully'
        : 'Action approved but execution failed',
    });
  } catch (error: any) {
    console.error('Error approving action:', error);
    return res.status(500).json({ error: 'Failed to approve action' });
  }
}

/**
 * POST /api/agent/actions/:actionId/reject
 * Reject a pending action
 */
export async function rejectAction(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const rejectedAction = await rejectPendingAction(actionId, userId, reason);

    if (!rejectedAction) {
      return res.status(404).json({
        error: 'Action not found or already processed',
      });
    }

    return res.json({
      action: rejectedAction,
      message: 'Action rejected successfully',
    });
  } catch (error: any) {
    console.error('Error rejecting action:', error);
    return res.status(500).json({ error: 'Failed to reject action' });
  }
}

/**
 * GET /api/agent/actions/count
 * Get count of pending actions for the user
 */
export async function getPendingActionsCount(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await countPendingActions(userId);

    return res.json({ count });
  } catch (error: any) {
    console.error('Error counting pending actions:', error);
    return res.status(500).json({ error: 'Failed to count pending actions' });
  }
}
