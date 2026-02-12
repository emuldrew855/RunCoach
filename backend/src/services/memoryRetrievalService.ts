/**
 * Memory Retrieval Service
 *
 * Retrieves relevant long-term memories for a user based on their current question/context.
 * Implements the "long-term semantic memory" tier of the three-tier memory system.
 */

import pool from '../config/database';
import { findSimilarConversations, findSimilarInsights } from './embeddingService';

export interface RelevantMemory {
  type: 'conversation' | 'insight' | 'pattern' | 'summary';
  content: string;
  relevance: number; // Similarity score
  metadata: any;
  timestamp: Date;
}

export interface LongTermMemory {
  relevantConversations: RelevantMemory[];
  relevantInsights: RelevantMemory[];
  recentSummaries: RelevantMemory[];
  tokenCount: number; // Estimated token count
}

/**
 * Retrieve relevant long-term memories for a user's current query
 * Returns the most relevant historical context to include in the agent's prompt
 */
export async function retrieveRelevantMemories(
  userId: number,
  query: string,
  maxMemories: number = 5
): Promise<LongTermMemory> {
  try {
    console.log(`🔍 Retrieving relevant memories for user ${userId}...`);

    // Parallel retrieval of different memory types
    const [similarConversations, similarInsights, recentSummaries] = await Promise.all([
      // Find similar past conversations
      findSimilarConversations(userId, query, maxMemories),

      // Find similar workout insights/patterns
      findSimilarInsights(userId, query, undefined, maxMemories),

      // Get recent conversation summaries (last 10)
      pool.query(
        `SELECT summary_text, key_insights, topics, sentiment, created_at
         FROM conversation_summaries
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      ),
    ]);

    // Format conversations
    const relevantConversations: RelevantMemory[] = similarConversations
      .filter((conv) => conv.similarity > 0.7) // Only include highly relevant (>70% similar)
      .map((conv) => ({
        type: 'conversation' as const,
        content: conv.content,
        relevance: conv.similarity,
        metadata: conv.metadata,
        timestamp: conv.created_at,
      }));

    // Format insights
    const relevantInsights: RelevantMemory[] = similarInsights
      .filter((insight) => insight.similarity > 0.7)
      .map((insight) => ({
        type: 'insight' as const,
        content: insight.insight_text,
        relevance: insight.similarity,
        metadata: {
          ...insight.metadata,
          insight_type: insight.insight_type,
        },
        timestamp: new Date(),
      }));

    // Format recent summaries (take top 3 most recent)
    const recentSummariesFormatted: RelevantMemory[] = recentSummaries.rows.slice(0, 3).map((summary) => ({
      type: 'summary' as const,
      content: summary.summary_text,
      relevance: 1.0, // Recent summaries are always relevant
      metadata: {
        key_insights: summary.key_insights,
        topics: summary.topics,
        sentiment: summary.sentiment,
      },
      timestamp: summary.created_at,
    }));

    // Estimate token count (rough estimate: 1 token ≈ 4 characters)
    const totalContent =
      relevantConversations.map((m) => m.content).join(' ') +
      relevantInsights.map((m) => m.content).join(' ') +
      recentSummariesFormatted.map((m) => m.content).join(' ');
    const tokenCount = Math.ceil(totalContent.length / 4);

    console.log(`✓ Retrieved ${relevantConversations.length} conversations, ${relevantInsights.length} insights, ${recentSummariesFormatted.length} summaries`);
    console.log(`  Estimated token usage: ~${tokenCount} tokens`);

    return {
      relevantConversations,
      relevantInsights,
      recentSummaries: recentSummariesFormatted,
      tokenCount,
    };
  } catch (error) {
    console.error('Error retrieving relevant memories:', error);
    // Return empty memories on error instead of failing
    return {
      relevantConversations: [],
      relevantInsights: [],
      recentSummaries: [],
      tokenCount: 0,
    };
  }
}

/**
 * Get recent patterns for a specific category
 * Useful for targeted retrieval (e.g., "show me pacing patterns")
 */
export async function getPatternsByCategory(
  userId: number,
  category: 'pacing' | 'hr_behavior' | 'recovery' | 'performance',
  limit: number = 10
): Promise<Array<{ pattern_text: string; occurrence_count: number; last_seen: Date }>> {
  try {
    const result = await pool.query(
      `SELECT pattern_text, occurrence_count, last_seen
       FROM activity_patterns
       WHERE user_id = $1 AND pattern_category = $2
       ORDER BY occurrence_count DESC, last_seen DESC
       LIMIT $3`,
      [userId, category, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting patterns by category:', error);
    return [];
  }
}

/**
 * Get all key insights for a user
 * Useful for dashboard or profile views
 */
export async function getAllUserInsights(
  userId: number
): Promise<{
  patterns: string[];
  preferences: string[];
  concerns: string[];
  successes: string[];
}> {
  try {
    const result = await pool.query(
      `SELECT insight_type, insight_text
       FROM workout_insights
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const insights = {
      patterns: [] as string[],
      preferences: [] as string[],
      concerns: [] as string[],
      successes: [] as string[],
    };

    result.rows.forEach((row) => {
      switch (row.insight_type) {
        case 'pattern':
          insights.patterns.push(row.insight_text);
          break;
        case 'preference':
          insights.preferences.push(row.insight_text);
          break;
        case 'concern':
          insights.concerns.push(row.insight_text);
          break;
        case 'success':
          insights.successes.push(row.insight_text);
          break;
      }
    });

    return insights;
  } catch (error) {
    console.error('Error getting all user insights:', error);
    return {
      patterns: [],
      preferences: [],
      concerns: [],
      successes: [],
    };
  }
}

/**
 * Format long-term memories for inclusion in agent prompt
 * Returns a formatted string that can be added to the system prompt
 */
export function formatMemoriesForPrompt(memories: LongTermMemory): string {
  if (
    memories.relevantConversations.length === 0 &&
    memories.relevantInsights.length === 0 &&
    memories.recentSummaries.length === 0
  ) {
    return '- No relevant long-term memories found yet. This is a relatively new athlete.';
  }

  let formatted = '';

  // Add relevant insights (patterns, preferences, concerns)
  if (memories.relevantInsights.length > 0) {
    formatted += '**Key Insights from Training History:**\n';
    memories.relevantInsights.forEach((insight, idx) => {
      const type = insight.metadata.insight_type;
      formatted += `${idx + 1}. [${type.toUpperCase()}] ${insight.content}\n`;
    });
    formatted += '\n';
  }

  // Add relevant past conversations
  if (memories.relevantConversations.length > 0) {
    formatted += '**Similar Past Coaching Moments:**\n';
    memories.relevantConversations.slice(0, 3).forEach((conv, idx) => {
      // Truncate long conversations
      const truncated = conv.content.length > 200 ? conv.content.substring(0, 200) + '...' : conv.content;
      formatted += `${idx + 1}. ${truncated}\n`;
    });
    formatted += '\n';
  }

  // Add recent context
  if (memories.recentSummaries.length > 0) {
    formatted += '**Recent Training Context:**\n';
    const mostRecent = memories.recentSummaries[0];
    formatted += `- ${mostRecent.content}\n`;
    if (mostRecent.metadata.key_insights && mostRecent.metadata.key_insights.length > 0) {
      formatted += `- Key points: ${mostRecent.metadata.key_insights.slice(0, 3).join('; ')}\n`;
    }
  }

  return formatted;
}
