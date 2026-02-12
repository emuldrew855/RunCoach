/**
 * Agent Action Controller
 *
 * Handles HTTP requests for pending action approval, rejection, and status queries.
 */

import { Request, Response, NextFunction } from 'express';
import {
  getPendingActionById,
  getPendingActionsByUser,
  approvePendingAction,
  rejectPendingAction,
  countPendingActions,
} from '../models/pending-action.model';
import { executeAction } from '../services/action-execution.service';
import { AuthenticationError, NotFoundError } from '../../utils/errors';
import { successResponse } from '../../utils/apiResponse';

/**
 * GET /api/agent/actions/pending
 * Get all pending actions for the authenticated user
 */
export async function getPendingActions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError();
    }

    const actions = await getPendingActionsByUser(userId, 'pending');

    res.json(
      successResponse({
        actions,
        count: actions.length,
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/agent/actions/:actionId
 * Get a specific pending action by ID
 */
export async function getPendingAction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;

    if (!userId) {
      throw new AuthenticationError();
    }

    const action = await getPendingActionById(actionId);

    if (!action) {
      throw new NotFoundError('Action');
    }

    // Note: Ownership check is handled by verifyActionOwnership middleware
    // This is defense in depth
    if (action.user_id !== userId) {
      throw new NotFoundError('Action');
    }

    res.json(successResponse({ action }));
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/agent/actions/:actionId/approve
 * Approve a pending action and execute it
 */
export async function approveAction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;

    if (!userId) {
      throw new AuthenticationError();
    }

    // Approve the action
    const approvedAction = await approvePendingAction(actionId, userId);

    if (!approvedAction) {
      throw new NotFoundError('Action');
    }

    // Execute the action
    const executionResult = await executeAction(actionId, userId);

    if (!executionResult.success) {
      // Action approved but execution failed - still return success for approval
      // but include execution failure details
      res.json(
        successResponse(
          {
            action: approvedAction,
            execution: executionResult,
          },
          'Action approved but execution failed'
        )
      );
      return;
    }

    res.json(
      successResponse(
        {
          action: approvedAction,
          execution: executionResult,
        },
        'Action approved and executed successfully'
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/agent/actions/:actionId/reject
 * Reject a pending action
 */
export async function rejectAction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    const { actionId } = req.params;
    const { reason } = req.body;

    if (!userId) {
      throw new AuthenticationError();
    }

    const rejectedAction = await rejectPendingAction(actionId, userId, reason);

    if (!rejectedAction) {
      throw new NotFoundError('Action');
    }

    res.json(
      successResponse(
        { action: rejectedAction },
        'Action rejected successfully'
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/agent/actions/count
 * Get count of pending actions for the user
 */
export async function getPendingActionsCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError();
    }

    const count = await countPendingActions(userId);

    res.json(successResponse({ count }));
  } catch (error) {
    next(error);
  }
}
