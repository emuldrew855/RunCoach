/**
 * Weekly Analysis Controller
 *
 * Endpoints for testing and triggering weekly analysis manually.
 */

import { Request, Response } from 'express';
import { performWeeklyAnalysis, performWeeklyAnalysisForAllUsers } from '../services/weeklyAnalysisService';

/**
 * POST /api/analysis/trigger
 * Manually trigger weekly analysis for authenticated user
 */
export async function triggerUserAnalysis(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`🔧 Manual trigger: weekly analysis for user ${userId}`);

    const result = await performWeeklyAnalysis(userId);

    if (result.success) {
      return res.json({
        message: 'Weekly analysis completed successfully',
        conversationId: result.conversationId,
        link: `/chat?conversation=${result.conversationId}`,
      });
    } else {
      return res.status(500).json({
        error: 'Failed to perform weekly analysis',
        details: result.error,
      });
    }
  } catch (error: any) {
    console.error('Trigger user analysis error:', error);
    return res.status(500).json({ error: 'Failed to trigger analysis' });
  }
}

/**
 * POST /api/analysis/trigger-all
 * Manually trigger weekly analysis for all users (admin only)
 */
export async function triggerAllUsersAnalysis(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`🔧 Manual trigger: weekly analysis for all users`);

    const result = await performWeeklyAnalysisForAllUsers();

    return res.json({
      message: 'Weekly analysis completed for all users',
      total: result.total,
      successful: result.successful,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('Trigger all users analysis error:', error);
    return res.status(500).json({ error: 'Failed to trigger analysis for all users' });
  }
}
