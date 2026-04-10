/**
 * Coaching API Routes
 *
 * Endpoints for AI-powered coaching features:
 * - Daily insight generation (Coach's Note)
 * - Insight dismissal
 * - Training status (Am I on track?)
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { generateDailyInsight, dismissInsight } from '../services/coachInsightService';
import { getTrainingStatus } from '../services/trainingStatusService';
import { getWeeklyExecutionSummary } from '../services/executionScoringService';
import { getProfileByUserId } from '../models/UserProfile';
import { successResponse } from '../utils/apiResponse';

const router = express.Router();

/**
 * GET /api/coaching/daily-insight
 * Get the AI-generated daily coaching insight
 */
router.get('/daily-insight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const insight = await generateDailyInsight(userId);

    if (!insight) {
      return res.json(successResponse({
        insight: null,
        dismissed: true,
      }));
    }

    res.json(successResponse({ insight }));
  } catch (error: any) {
    console.error('Error getting daily insight:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate daily insight',
    });
  }
});

/**
 * POST /api/coaching/daily-insight/dismiss
 * Dismiss the daily insight until tomorrow
 */
router.post('/daily-insight/dismiss', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    await dismissInsight(userId);

    res.json(successResponse({
      message: 'Insight dismissed until tomorrow',
    }));
  } catch (error: any) {
    console.error('Error dismissing insight:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to dismiss insight',
    });
  }
});

/**
 * GET /api/coaching/training-status
 * Get the user's current training status
 */
router.get('/training-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const status = await getTrainingStatus(userId);

    res.json(successResponse({ status }));
  } catch (error: any) {
    console.error('Error getting training status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get training status',
    });
  }
});

/**
 * GET /api/coaching/weekly-execution
 * Get this week's workout execution summary
 */
router.get('/weekly-execution', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user's week start preference
    const profile = await getProfileByUserId(userId);
    const weekStartsOn = profile?.week_starts_on || 'monday';

    const summary = await getWeeklyExecutionSummary(userId, weekStartsOn);

    res.json(successResponse({ summary }));
  } catch (error: any) {
    console.error('Error getting weekly execution:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get weekly execution summary',
    });
  }
});

export default router;
