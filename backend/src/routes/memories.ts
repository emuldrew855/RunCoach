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
import { pool } from '../config/database';

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

export default router;
