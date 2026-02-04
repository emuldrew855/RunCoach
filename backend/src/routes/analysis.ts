/**
 * Weekly Analysis Routes
 *
 * Routes for testing and triggering weekly analysis manually.
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  triggerUserAnalysis,
  triggerAllUsersAnalysis,
} from '../controllers/weeklyAnalysisController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Trigger analysis for current user
router.post('/trigger', triggerUserAnalysis);

// Trigger analysis for all users
router.post('/trigger-all', triggerAllUsersAnalysis);

export default router;
