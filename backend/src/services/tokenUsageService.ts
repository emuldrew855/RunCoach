/**
 * Token Usage Service
 *
 * Tracks OpenAI token usage and calculates costs for monitoring.
 */

import { query } from '../config/database';

// Pricing per 1M tokens (as of 2024, in USD)
// Source: https://openai.com/pricing
const TOKEN_PRICING = {
  'gpt-4': { prompt: 30.00, completion: 60.00 }, // per 1M tokens
  'gpt-4-turbo': { prompt: 10.00, completion: 30.00 },
  'gpt-4o': { prompt: 5.00, completion: 15.00 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
  'gpt-3.5-turbo': { prompt: 0.50, completion: 1.50 },
  'claude-sonnet-4-5': { prompt: 3.00, completion: 15.00 }, // Anthropic pricing
  'claude-opus-4-5': { prompt: 15.00, completion: 75.00 },
};

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Calculate estimated cost based on token usage and model
 */
function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): number {
  // Find pricing for model (match by prefix)
  let pricing = TOKEN_PRICING['gpt-4o-mini']; // Default fallback

  for (const [modelKey, modelPricing] of Object.entries(TOKEN_PRICING)) {
    if (model.startsWith(modelKey)) {
      pricing = modelPricing;
      break;
    }
  }

  // Calculate cost (pricing is per 1M tokens, result in USD)
  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;

  // Return cost in cents for easier database storage
  return (promptCost + completionCost) * 100;
}

/**
 * Track token usage for a request
 */
export async function trackTokenUsage(
  userId: number | undefined,
  conversationId: string | undefined,
  usage: TokenUsage,
  model: string,
  requestType: string
): Promise<void> {
  try {
    const estimatedCostCents = calculateCost(
      usage.promptTokens,
      usage.completionTokens,
      model
    );

    await query(
      `INSERT INTO token_usage
       (user_id, conversation_id, prompt_tokens, completion_tokens, total_tokens,
        model, estimated_cost_cents, request_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        conversationId || null,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        model,
        estimatedCostCents,
        requestType,
      ]
    );
  } catch (error) {
    console.error('Failed to track token usage:', error);
    // Don't throw - token tracking failures shouldn't break the app
  }
}

/**
 * Get token usage summary
 */
export async function getTokenUsageSummary() {
  const result = await query('SELECT * FROM token_usage_summary');
  return result.rows[0];
}

/**
 * Get token usage by date range (for charts)
 */
export async function getTokenUsageByDate(days: number = 30) {
  const result = await query(
    `SELECT
       DATE(created_at) as date,
       SUM(total_tokens) as total_tokens,
       SUM(estimated_cost_cents) / 100.0 as cost_usd,
       COUNT(*) as request_count
     FROM token_usage
     WHERE created_at > NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`
  );
  return result.rows;
}

/**
 * Get token usage by model (for breakdown)
 */
export async function getTokenUsageByModel(days: number = 30) {
  const result = await query(
    `SELECT
       model,
       SUM(total_tokens) as total_tokens,
       SUM(estimated_cost_cents) / 100.0 as cost_usd,
       COUNT(*) as request_count,
       AVG(total_tokens) as avg_tokens_per_request
     FROM token_usage
     WHERE created_at > NOW() - INTERVAL '${days} days'
     GROUP BY model
     ORDER BY total_tokens DESC`
  );
  return result.rows;
}

/**
 * Get top users by token usage (for admin monitoring)
 */
export async function getTopUsersByTokenUsage(limit: number = 10) {
  const result = await query(
    `SELECT * FROM user_token_usage
     ORDER BY tokens_30d DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
