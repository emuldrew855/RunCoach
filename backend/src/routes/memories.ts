/**
 * Memory API Routes
 *
 * Endpoints for accessing user's long-term memories:
 * - Insights (patterns, preferences, concerns, successes)
 * - Activity patterns (pacing, HR, recovery, performance)
 * - Conversation summaries (recent coaching context)
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getAllUserInsights, getPatternsByCategory } from '../services/memoryRetrievalService';
import { consolidateUserMemories } from '../services/memoryConsolidationService';
import { successResponse } from '../utils/apiResponse';
import pool from '../config/database';

const router = express.Router();

/**
 * GET /api/memories/insights
 * Get all user insights categorized by type
 */
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const insights = await getAllUserInsights(userId);

    res.json(successResponse({ insights }));
  } catch (error: any) {
    console.error('Error fetching user insights:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch insights',
    });
  }
});

/**
 * GET /api/memories/patterns
 * Get activity patterns, optionally filtered by category
 * Query params: category (optional) - 'pacing' | 'hr_behavior' | 'recovery' | 'performance'
 */
router.get('/patterns', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { category } = req.query;

    // Validate category if provided
    if (category && !['pacing', 'hr_behavior', 'recovery', 'performance'].includes(category as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category. Must be one of: pacing, hr_behavior, recovery, performance',
      });
    }

    let patterns;
    if (category) {
      patterns = await getPatternsByCategory(userId, category as any, 50);
    } else {
      // Get all patterns across all categories
      const result = await pool.query(
        `SELECT pattern_text, pattern_category, occurrence_count, last_seen, metadata
         FROM activity_patterns
         WHERE user_id = $1
         ORDER BY occurrence_count DESC, last_seen DESC
         LIMIT 50`,
        [userId]
      );
      patterns = result.rows;
    }

    res.json(successResponse({ patterns }));
  } catch (error: any) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch patterns',
    });
  }
});

/**
 * GET /api/memories/summaries
 * Get recent conversation summaries
 */
router.get('/summaries', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `SELECT summary_text, key_insights, topics, sentiment, created_at
       FROM conversation_summaries
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json(successResponse({ summaries: result.rows }));
  } catch (error: any) {
    console.error('Error fetching conversation summaries:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summaries',
    });
  }
});

/**
 * GET /api/memories/stats
 * Get memory statistics for the user
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get counts for each memory type
    const [insightsResult, patternsResult, summariesResult, conversationsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM workout_insights WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM activity_patterns WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM conversation_summaries WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM conversation_embeddings WHERE user_id = $1', [userId]),
    ]);

    const stats = {
      insights: parseInt(insightsResult.rows[0].count),
      patterns: parseInt(patternsResult.rows[0].count),
      summaries: parseInt(summariesResult.rows[0].count),
      conversation_memories: parseInt(conversationsResult.rows[0].count),
    };

    res.json(successResponse({ stats }));
  } catch (error: any) {
    console.error('Error fetching memory stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch memory stats',
    });
  }
});

/**
 * POST /api/memories/consolidate
 * Trigger memory consolidation for the current user
 * (Admin/maintenance endpoint)
 */
router.post('/consolidate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await consolidateUserMemories(userId);

    res.json(
      successResponse({
        message: 'Memory consolidation complete',
        result,
      })
    );
  } catch (error: any) {
    console.error('Error consolidating memories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to consolidate memories',
    });
  }
});

/**
 * GET /api/memories/diagnostic
 * Diagnostic endpoint to debug memory creation issues
 */
router.get('/diagnostic', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Check pgvector extension
    let pgvectorEnabled = false;
    try {
      const extResult = await pool.query(
        "SELECT extname FROM pg_extension WHERE extname = 'vector'"
      );
      pgvectorEnabled = extResult.rows.length > 0;
    } catch (e) {
      // Extension check failed
    }

    // Check tables exist
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('conversation_embeddings', 'workout_insights', 'activity_patterns', 'conversation_summaries')
    `);
    const existingTables = tablesResult.rows.map(r => r.table_name);

    // Get memory counts
    const [insightsCount, patternsCount, summariesCount, embeddingsCount] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM workout_insights WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM activity_patterns WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM conversation_summaries WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM conversation_embeddings WHERE user_id = $1', [userId]),
    ]);

    // Get recent conversations (last 5)
    const recentConversations = await pool.query(`
      SELECT c.id, c.title, c.created_at,
             (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = c.id) as message_count,
             (SELECT COUNT(*) FROM conversation_summaries cs WHERE cs.conversation_id = c.id::text) as has_summary
      FROM conversations c
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 5
    `, [userId]);

    // Check OpenAI API key is set (without exposing it)
    const openaiKeySet = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10;

    // Check agent service URL
    const agentServiceUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:3002';

    res.json(successResponse({
      diagnostic: {
        pgvectorEnabled,
        existingTables,
        openaiKeyConfigured: openaiKeySet,
        agentServiceUrl,
        memoryCounts: {
          insights: parseInt(insightsCount.rows[0].count),
          patterns: parseInt(patternsCount.rows[0].count),
          summaries: parseInt(summariesCount.rows[0].count),
          conversationEmbeddings: parseInt(embeddingsCount.rows[0].count),
        },
        recentConversations: recentConversations.rows.map(c => ({
          id: c.id,
          title: c.title,
          createdAt: c.created_at,
          messageCount: parseInt(c.message_count),
          hasSummary: parseInt(c.has_summary) > 0,
        })),
      },
    }));
  } catch (error: any) {
    console.error('Error running diagnostic:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run diagnostic',
    });
  }
});

/**
 * POST /api/memories/reprocess-conversation/:conversationId
 * Manually trigger conversation processing for a specific conversation
 * Useful for re-processing conversations that weren't processed
 */
router.post('/reprocess-conversation/:conversationId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    // Verify conversation belongs to user
    const convCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found or does not belong to user',
      });
    }

    // Import and call the conversation processing service
    const { processConversation } = await import('../services/conversationSummarizationService');
    await processConversation(userId, conversationId);

    res.json(successResponse({
      message: 'Conversation reprocessed successfully',
      conversationId,
    }));
  } catch (error: any) {
    console.error('Error reprocessing conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reprocess conversation',
    });
  }
});

export default router;
