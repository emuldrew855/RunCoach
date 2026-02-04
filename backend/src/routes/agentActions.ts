/**
 * Agent Actions Routes
 *
 * Routes for managing pending actions (approval, rejection, querying).
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getPendingActions,
  getPendingAction,
  approveAction,
  rejectAction,
  getPendingActionsCount,
} from '../controllers/agentActionController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get all pending actions for user
router.get('/pending', getPendingActions);

// Get count of pending actions
router.get('/count', getPendingActionsCount);

// Get specific pending action
router.get('/:actionId', getPendingAction);

// Approve a pending action
router.post('/:actionId/approve', approveAction);

// Reject a pending action
router.post('/:actionId/reject', rejectAction);

export default router;
