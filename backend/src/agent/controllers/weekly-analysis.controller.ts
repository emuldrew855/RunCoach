/**
 * Weekly Analysis Controller
 *
 * Endpoints for testing and triggering weekly analysis manually.
 */

import { Request, Response, NextFunction } from 'express';
import { performWeeklyAnalysis, performWeeklyAnalysisForAllUsers } from '../services/weekly-analysis.service';
import { AuthenticationError, AgentError } from '../../utils/errors';
import { successResponse } from '../../utils/apiResponse';

/**
 * POST /api/analysis/trigger
 * Manually trigger weekly analysis for authenticated user
 */
export async function triggerUserAnalysis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError();
    }

    console.log(`🔧 Manual trigger: weekly analysis for user ${userId}`);

    const result = await performWeeklyAnalysis(userId);

    if (!result.success) {
      throw new AgentError(
        result.error || 'Failed to perform weekly analysis',
        'weekly_analysis'
      );
    }

    res.json(
      successResponse(
        {
          conversationId: result.conversationId,
          link: `/chat?conversation=${result.conversationId}`,
        },
        'Weekly analysis completed successfully'
      )
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/analysis/trigger-all
 * Manually trigger weekly analysis for all users (admin only)
 */
export async function triggerAllUsersAnalysis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthenticationError();
    }

    console.log(`🔧 Manual trigger: weekly analysis for all users`);

    const result = await performWeeklyAnalysisForAllUsers();

    res.json(
      successResponse(
        {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
        },
        'Weekly analysis completed for all users'
      )
    );
  } catch (error) {
    next(error);
  }
}
