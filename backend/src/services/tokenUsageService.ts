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

// Extended interface for agent-specific tracking
export interface AgentUsageData extends TokenUsage {
  intent?: string;
  intentConfidence?: number;
  architecture?: 'two_pass' | 'single_pass';
  responseTimeMs?: number;
  contextTokens?: number;
  toolCallsCount?: number;
  toolsUsed?: string[];
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
 * Track agent usage with extended metrics (intent, architecture, response time, etc.)
 */
export async function trackAgentUsage(
  userId: number | undefined,
  conversationId: string | undefined,
  usage: AgentUsageData,
  model: string,
  requestType: string = 'agent'
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
        model, estimated_cost_cents, request_type,
        intent, intent_confidence, architecture, response_time_ms, context_tokens,
        tool_calls_count, tools_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        userId || null,
        conversationId || null,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        model,
        estimatedCostCents,
        requestType,
        usage.intent || null,
        usage.intentConfidence || null,
        usage.architecture || null,
        usage.responseTimeMs || null,
        usage.contextTokens || null,
        usage.toolCallsCount || 0,
        usage.toolsUsed || null,
      ]
    );

    console.log(`📊 Agent usage tracked: ${usage.totalTokens} tokens, ${usage.intent} intent, ${usage.responseTimeMs}ms`);
  } catch (error) {
    console.error('Failed to track agent usage:', error);
    // Don't throw - tracking failures shouldn't break the app
  }
}

/**
 * Helper to convert PostgreSQL numeric strings to JavaScript numbers
 */
function parseNumericFields<T extends Record<string, any>>(row: T, fields: string[]): T {
  if (!row) return row;
  const parsed = { ...row } as Record<string, any>;
  for (const field of fields) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      parsed[field] = Number(parsed[field]);
    }
  }
  return parsed as T;
}

/**
 * Get token usage summary
 */
export async function getTokenUsageSummary() {
  const result = await query('SELECT * FROM token_usage_summary');
  if (!result.rows[0]) return null;

  // Convert numeric fields from PostgreSQL strings to JavaScript numbers
  return parseNumericFields(result.rows[0], [
    'total_tokens', 'tokens_24h', 'tokens_7d', 'tokens_30d',
    'cost_24h_usd', 'cost_7d_usd', 'cost_30d_usd', 'total_cost_usd',
    'total_requests', 'avg_tokens_per_request'
  ]);
}

/**
 * Get token usage by date range (for charts)
 */
export async function getTokenUsageByDate(days: number = 30) {
  // Sanitize days parameter to prevent SQL injection
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 30), 365));

  const result = await query(
    `SELECT
       DATE(created_at) as date,
       SUM(total_tokens) as total_tokens,
       SUM(estimated_cost_cents) / 100.0 as cost_usd,
       COUNT(*) as request_count
     FROM token_usage
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [safeDays]
  );

  // Convert numeric fields
  return result.rows.map(row => parseNumericFields(row, [
    'total_tokens', 'cost_usd', 'request_count'
  ]));
}

/**
 * Get token usage by model (for breakdown)
 */
export async function getTokenUsageByModel(days: number = 30) {
  // Sanitize days parameter to prevent SQL injection
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 30), 365));

  const result = await query(
    `SELECT
       model,
       SUM(total_tokens) as total_tokens,
       SUM(estimated_cost_cents) / 100.0 as cost_usd,
       COUNT(*) as request_count,
       AVG(total_tokens) as avg_tokens_per_request
     FROM token_usage
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY model
     ORDER BY total_tokens DESC`,
    [safeDays]
  );

  // Convert numeric fields
  return result.rows.map(row => parseNumericFields(row, [
    'total_tokens', 'cost_usd', 'request_count', 'avg_tokens_per_request'
  ]));
}

/**
 * Get top users by token usage (for admin monitoring)
 */
export async function getTopUsersByTokenUsage(limit: number = 10) {
  // Sanitize limit parameter
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 10), 100));

  const result = await query(
    `SELECT * FROM user_token_usage
     ORDER BY tokens_30d DESC
     LIMIT $1`,
    [safeLimit]
  );

  // Convert numeric fields
  return result.rows.map(row => parseNumericFields(row, [
    'total_tokens', 'tokens_30d', 'total_cost_usd', 'cost_30d_usd', 'total_requests'
  ]));
}

// ============================================================================
// Agent Analytics Functions
// ============================================================================

/**
 * Get agent analytics summary
 */
export async function getAgentAnalyticsSummary() {
  const result = await query('SELECT * FROM agent_analytics_summary');
  if (!result.rows[0]) return null;

  return parseNumericFields(result.rows[0], [
    'total_requests', 'requests_24h', 'requests_7d',
    'total_tokens', 'total_prompt_tokens', 'total_completion_tokens',
    'avg_tokens_per_request', 'avg_context_tokens', 'avg_context_utilization_percent',
    'max_context_tokens', 'avg_response_time_ms', 'p95_response_time_ms', 'max_response_time_ms',
    'two_pass_requests_7d', 'single_pass_requests_7d', 'total_tool_calls_7d',
    'total_cost_usd', 'cost_24h_usd', 'cost_7d_usd'
  ]);
}

/**
 * Get intent distribution for pie chart
 */
export async function getAgentIntentDistribution() {
  const result = await query('SELECT * FROM agent_intent_distribution');

  return result.rows.map(row => parseNumericFields(row, [
    'request_count', 'avg_confidence', 'avg_tokens', 'avg_response_time_ms', 'total_cost_usd'
  ]));
}

/**
 * Get model usage breakdown
 */
export async function getAgentModelUsage() {
  const result = await query('SELECT * FROM agent_model_usage');

  return result.rows.map(row => parseNumericFields(row, [
    'request_count', 'total_tokens', 'avg_tokens', 'total_cost_usd', 'avg_response_time_ms'
  ]));
}

/**
 * Get daily agent metrics for trend charts
 */
export async function getAgentDailyMetrics(days: number = 30) {
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days) || 30), 90));

  const result = await query(
    `SELECT
       DATE(created_at) as date,
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens,
       AVG(total_tokens)::INTEGER as avg_tokens,
       AVG(context_tokens)::INTEGER as avg_context_tokens,
       AVG(response_time_ms)::INTEGER as avg_response_time_ms,
       SUM(estimated_cost_cents) / 100.0 as cost_usd,
       COUNT(CASE WHEN architecture = 'two_pass' THEN 1 END) as two_pass_count,
       COUNT(CASE WHEN architecture = 'single_pass' THEN 1 END) as single_pass_count,
       SUM(tool_calls_count) as total_tool_calls
     FROM token_usage
     WHERE created_at > NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [safeDays]
  );

  return result.rows.map(row => parseNumericFields(row, [
    'request_count', 'total_tokens', 'avg_tokens', 'avg_context_tokens',
    'avg_response_time_ms', 'cost_usd', 'two_pass_count', 'single_pass_count', 'total_tool_calls'
  ]));
}

/**
 * Get recent agent requests with full details
 */
export async function getAgentRecentRequests(limit: number = 50) {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 50), 200));

  const result = await query(
    `SELECT
       tu.id,
       tu.created_at,
       u.first_name || ' ' || u.last_name as user_name,
       tu.intent,
       tu.intent_confidence,
       tu.architecture,
       tu.model,
       tu.prompt_tokens,
       tu.completion_tokens,
       tu.total_tokens,
       tu.context_tokens,
       CASE WHEN tu.context_tokens IS NOT NULL
            THEN ROUND((tu.context_tokens::DECIMAL / 128000 * 100), 1)
            ELSE NULL
       END as context_utilization_percent,
       tu.response_time_ms,
       tu.tool_calls_count,
       tu.tools_used,
       tu.estimated_cost_cents / 100.0 as cost_usd
     FROM token_usage tu
     LEFT JOIN users u ON tu.user_id = u.id
     WHERE tu.request_type IN ('agent', 'chat', 'analysis')
     ORDER BY tu.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows.map(row => parseNumericFields(row, [
    'id', 'intent_confidence', 'prompt_tokens', 'completion_tokens', 'total_tokens',
    'context_tokens', 'context_utilization_percent', 'response_time_ms', 'tool_calls_count', 'cost_usd'
  ]));
}
