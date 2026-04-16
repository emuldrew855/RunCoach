/**
 * Agent Context Routes
 *
 * Provides endpoints for agent service to fetch user context and save messages.
 */

import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { buildUserContext } from '../utils/contextBuilder';
import { buildContextForIntent, Intent } from '../utils/intentContextBuilder';
import {
  buildCoreContext,
  buildActiveContext,
  buildDeepContext,
  getLastActivity,
  getRecentActivities,
  getUpcomingWorkoutsForDays,
  getHRZoneSummaryForDays,
} from '../utils/tieredContextBuilder';
import { getMessagesByConversationId, createMessage } from '../models/Chat';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { successResponse } from '../utils/apiResponse';
import { trackTokenUsage } from '../services/tokenUsageService';
import { updatePlannedWorkout, createPlannedWorkout, deletePlannedWorkout } from '../models/PlannedWorkout';
import * as BulkWorkoutService from '../services/bulkWorkoutService';

const router = Router();

// All routes require service authentication
router.use(requireServiceAuth);

/**
 * GET /api/v1/agent/context/:userId
 * Fetch user context for agent (with optional intent for context filtering)
 */
router.get('/context/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    // Check if intent-based context filtering is requested
    const intent = req.query.intent as Intent | undefined;
    const userMessage = req.query.message as string | undefined;

    console.log('\n========== AGENT REQUEST: GET CONTEXT ==========');
    console.log('User ID:', userId);
    console.log('Intent:', intent || 'full (legacy)');
    console.log('User Message:', userMessage ? userMessage.substring(0, 100) + '...' : 'N/A');
    console.log('================================================\n');

    let context;
    if (intent) {
      // Use intent-based context builder (60-87% token reduction)
      console.log(`📊 Using intent-based context: ${intent}`);
      context = await buildContextForIntent(userId, intent, userMessage);
    } else {
      // Fallback to full context (legacy)
      console.log('📊 Using full context (legacy mode)');
      context = await buildUserContext(userId);
    }

    res.json(successResponse({ context, intent: intent || 'full' }));
  } catch (error: any) {
    console.error('Failed to build user context:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// TIERED CONTEXT ENDPOINTS (for multi-agent architecture)
// ============================================

/**
 * GET /api/v1/agent/context/:userId/core
 * Fetch CORE context only (~1k tokens)
 * Contains: Basic profile, goal, training phase
 */
router.get('/context/:userId/core', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    console.log(`📦 TIERED CONTEXT: Loading CORE for user ${userId}`);
    const context = await buildCoreContext(userId);

    res.json(successResponse({ context, tier: 'core', estimatedTokens: 1000 }));
  } catch (error: any) {
    console.error('Failed to build core context:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/context/:userId/active
 * Fetch ACTIVE context (~3k tokens)
 * Contains: This week's data, last 2 runs, current adherence
 */
router.get('/context/:userId/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    console.log(`📦 TIERED CONTEXT: Loading ACTIVE for user ${userId}`);
    const context = await buildActiveContext(userId);

    res.json(successResponse({ context, tier: 'active', estimatedTokens: 3000 }));
  } catch (error: any) {
    console.error('Failed to build active context:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/context/:userId/deep
 * Fetch DEEP context (~15k tokens)
 * Contains: 30-day history, 4-week plan, HR distribution, trends
 */
router.get('/context/:userId/deep', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    console.log(`📦 TIERED CONTEXT: Loading DEEP for user ${userId}`);
    const context = await buildDeepContext(userId);

    res.json(successResponse({ context, tier: 'deep', estimatedTokens: 15000 }));
  } catch (error: any) {
    console.error('Failed to build deep context:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// JIT DATA ENDPOINTS (for worker tools)
// ============================================

/**
 * GET /api/v1/agent/data/last-activity/:userId
 * Fetch just the most recent activity (~500 tokens)
 */
router.get('/data/last-activity/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const activity = await getLastActivity(userId);

    res.json(successResponse({ activity }));
  } catch (error: any) {
    console.error('Failed to get last activity:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/data/recent-activities/:userId
 * Fetch recent activities for N days (~300 tokens per activity)
 */
router.get('/data/recent-activities/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days as string) || 7;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const activities = await getRecentActivities(userId, Math.min(days, 30));

    res.json(successResponse({ activities, days }));
  } catch (error: any) {
    console.error('Failed to get recent activities:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/data/upcoming-workouts/:userId
 * Fetch upcoming workouts for N days (~500 tokens for 7 days)
 */
router.get('/data/upcoming-workouts/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days as string) || 7;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const workouts = await getUpcomingWorkoutsForDays(userId, Math.min(days, 28));

    res.json(successResponse({ workouts, days }));
  } catch (error: any) {
    console.error('Failed to get upcoming workouts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/data/hr-zones/:userId
 * Fetch HR zone summary for N days (~400 tokens)
 */
router.get('/data/hr-zones/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.userId);
    const days = parseInt(req.query.days as string) || 30;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const hrZones = await getHRZoneSummaryForDays(userId, Math.min(days, 90));

    res.json(successResponse({ hrZones, days }));
  } catch (error: any) {
    console.error('Failed to get HR zone summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/agent/conversation/:conversationId
 * Fetch conversation history
 */
router.get(
  '/conversation/:conversationId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const messages = await getMessagesByConversationId(conversationId, limit);

      res.json(successResponse({ messages }));
    } catch (error: any) {
      console.error('Failed to fetch conversation history:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/v1/agent/save-message
 * Save assistant message from agent service
 */
router.post('/save-message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, conversationId, role, content, contextSnapshot, toolCalls, pendingActionIds } =
      req.body;

    if (!userId || !conversationId || !role || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const message = await createMessage({
      user_id: userId,
      conversation_id: conversationId,
      role,
      content,
      context_snapshot: contextSnapshot,
      tool_calls: toolCalls,
      pending_actions: pendingActionIds,
      model_used: 'agent-service',
      is_agent_initiated: false,
    });

    res.json(successResponse({ saved: true, message }));
  } catch (error: any) {
    console.error('Failed to save message:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/update-message-actions
 * Update message with pending action IDs
 */
router.post('/update-message-actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId, pendingActionIds } = req.body;

    if (!messageId || !pendingActionIds) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const { updateMessagePendingActions } = require('../models/Chat');
    const updatedMessage = await updateMessagePendingActions(messageId, pendingActionIds);

    res.json(successResponse({ message: updatedMessage }));
  } catch (error: any) {
    console.error('Failed to update message actions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/token-usage
 * Track token usage from agent service
 * Supports both basic token tracking and extended agent analytics
 */
router.post('/token-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userId,
      conversationId,
      promptTokens,
      completionTokens,
      totalTokens,
      model,
      requestType,
      // Extended agent analytics fields
      intent,
      intentConfidence,
      architecture,
      responseTimeMs,
      contextTokens,
      toolCallsCount,
      toolsUsed,
    } = req.body;

    // Check if this is an extended agent request or basic token tracking
    const hasExtendedFields = intent || architecture || responseTimeMs !== undefined;

    if (hasExtendedFields) {
      // Use extended agent tracking
      const { trackAgentUsage } = require('../services/tokenUsageService');
      await trackAgentUsage(
        userId,
        conversationId,
        {
          promptTokens,
          completionTokens,
          totalTokens,
          intent,
          intentConfidence,
          architecture,
          responseTimeMs,
          contextTokens,
          toolCallsCount,
          toolsUsed,
        },
        model,
        requestType
      );
    } else {
      // Use basic token tracking
      await trackTokenUsage(
        userId,
        conversationId,
        {
          promptTokens,
          completionTokens,
          totalTokens,
        },
        model,
        requestType
      );
    }

    res.json(successResponse({ tracked: true }));
  } catch (error: any) {
    console.error('Failed to track token usage:', error);
    // Don't fail the request if token tracking fails
    res.json(successResponse({ tracked: false, error: error.message }));
  }
});

/**
 * POST /api/v1/agent/workout/shift
 * Shift a workout to a different date
 */
router.post('/workout/shift', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workoutId, newDate } = req.body;

    if (!workoutId || !newDate) {
      return res.status(400).json({
        success: false,
        error: 'workoutId and newDate are required',
      });
    }

    await updatePlannedWorkout(workoutId, { scheduled_date: newDate });

    res.json(successResponse({ success: true, workoutId, newDate }));
  } catch (error: any) {
    console.error('Failed to shift workout:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/workout/modify
 * Modify workout details
 */
router.post('/workout/modify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workoutId, updates } = req.body;

    if (!workoutId || !updates) {
      return res.status(400).json({
        success: false,
        error: 'workoutId and updates are required',
      });
    }

    await updatePlannedWorkout(workoutId, updates);

    res.json(successResponse({ success: true, workoutId, updates }));
  } catch (error: any) {
    console.error('Failed to modify workout:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/workout/create
 * Create a new workout
 */
router.post('/workout/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, workout } = req.body;

    if (!userId || !workout) {
      return res.status(400).json({
        success: false,
        error: 'userId and workout are required',
      });
    }

    const newWorkout = await createPlannedWorkout(workout);

    res.json(successResponse({ success: true, workout: newWorkout }));
  } catch (error: any) {
    console.error('Failed to create workout:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/workout/delete
 * Delete a workout
 */
router.post('/workout/delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workoutId } = req.body;

    if (!workoutId) {
      return res.status(400).json({
        success: false,
        error: 'workoutId is required',
      });
    }

    await deletePlannedWorkout(workoutId);

    res.json(successResponse({ success: true, workoutId }));
  } catch (error: any) {
    console.error('Failed to delete workout:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/workout/bulk-modify-preview
 * Preview bulk modification of workouts
 */
router.post('/workout/bulk-modify-preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, criteria, updates } = req.body;

    if (!userId || !criteria || !updates) {
      return res.status(400).json({
        success: false,
        error: 'userId, criteria, and updates are required',
      });
    }

    // Validate criteria
    const validationError = BulkWorkoutService.validateBulkCriteria(criteria);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const preview = await BulkWorkoutService.previewBulkModification(userId, criteria, updates);

    res.json(successResponse({ preview }));
  } catch (error: any) {
    console.error('Bulk modification preview failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/agent/process-conversation
 * Process conversation for long-term memory (Phase 2: RAG)
 * Called by agent service after streaming completes
 */
router.post('/process-conversation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, conversationId } = req.body;

    if (!userId || !conversationId) {
      return res.status(400).json({
        success: false,
        error: 'userId and conversationId are required',
      });
    }

    console.log(`🧠 Triggering conversation processing for ${conversationId} (user ${userId})`);

    // Import and call the conversation processing service asynchronously
    // Don't await - let it run in background
    import('../services/conversationSummarizationService')
      .then(({ processConversation }) => processConversation(userId, conversationId))
      .catch((error) => {
        console.error('Background conversation processing error:', error);
      });

    // Respond immediately so agent service doesn't wait
    res.json(successResponse({ processed: true }));
  } catch (error: any) {
    console.error('Failed to process conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
