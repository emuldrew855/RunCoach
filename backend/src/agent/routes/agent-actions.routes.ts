/**
 * Agent Actions Routes
 *
 * Routes for managing pending actions (approval, rejection, querying).
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { verifyActionOwnership } from '../middleware/agent-auth.middleware';
import { requireServiceAuth } from '../middleware/agent-auth.middleware';
import {
  approveActionSchema,
  rejectActionSchema,
  getActionSchema,
  getPendingActionsSchema,
} from '../validation';
import {
  getPendingActions,
  getPendingAction,
  approveAction,
  rejectAction,
  getPendingActionsCount,
} from '../controllers/agent-action.controller';
import { createPendingAction } from '../models/pending-action.model';

const router = Router();

// Create pending action (agent service only - no user auth required)
router.post('/create', requireServiceAuth, async (req: Request, res: Response) => {
  try {
    const { user_id, conversation_id, message_id, action_type, action_payload, agent_reasoning } = req.body;

    if (!user_id || !conversation_id || !action_type || !action_payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, conversation_id, action_type, action_payload',
      });
    }

    const action = await createPendingAction({
      user_id,
      conversation_id,
      message_id: message_id || null,
      action_type,
      action_payload,
      agent_reasoning: agent_reasoning || null,
    });

    res.json({
      success: true,
      data: { action },
    });
  } catch (error: any) {
    console.error('Failed to create pending action:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// All other routes require user authentication
router.use(authenticateToken);

// Get all pending actions for user
router.get('/pending', validate(getPendingActionsSchema), getPendingActions);

// Get count of pending actions
router.get('/count', getPendingActionsCount);

// Get specific pending action (requires ownership + validation)
router.get('/:actionId', validate(getActionSchema), verifyActionOwnership, getPendingAction);

// Approve a pending action (requires rate limiting + validation + ownership)
router.post('/:actionId/approve', validate(approveActionSchema), verifyActionOwnership, approveAction);

// Reject a pending action (requires validation + ownership)
router.post('/:actionId/reject', validate(rejectActionSchema), verifyActionOwnership, rejectAction);

export default router;
