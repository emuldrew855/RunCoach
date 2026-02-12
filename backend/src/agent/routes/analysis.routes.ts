/**
 * Weekly Analysis Routes
 *
 * Routes for testing and triggering weekly analysis manually.
 */

import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { checkTokenLimit } from '../../middleware/tokenLimitMiddleware';
import {
  triggerUserAnalysis,
  triggerAllUsersAnalysis,
} from '../controllers/weekly-analysis.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Trigger analysis for current user (token limited)
router.post('/trigger', checkTokenLimit, triggerUserAnalysis);

// Trigger analysis for all users (token limited)
router.post('/trigger-all', checkTokenLimit, triggerAllUsersAnalysis);

export default router;
