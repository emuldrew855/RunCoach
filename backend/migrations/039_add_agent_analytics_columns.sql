-- Migration: Add Agent Analytics Columns
-- Description: Extend token_usage table with agent-specific metrics for admin analytics
-- Idempotent: Can be run multiple times safely

-- Add new columns to token_usage table
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS intent VARCHAR(50);
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS intent_confidence DECIMAL(3, 2);
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS architecture VARCHAR(20); -- 'two_pass' or 'single_pass'
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS context_tokens INTEGER; -- Tokens used for context (subset of prompt_tokens)
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS tool_calls_count INTEGER DEFAULT 0;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS tools_used TEXT[]; -- Array of tool names used

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_token_usage_intent ON token_usage(intent);
CREATE INDEX IF NOT EXISTS idx_token_usage_architecture ON token_usage(architecture);

-- Agent Analytics Summary View
CREATE OR REPLACE VIEW agent_analytics_summary AS
SELECT
    -- Request counts
    COUNT(*) as total_requests,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as requests_24h,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as requests_7d,

    -- Token usage
    SUM(total_tokens) as total_tokens,
    SUM(prompt_tokens) as total_prompt_tokens,
    SUM(completion_tokens) as total_completion_tokens,
    AVG(total_tokens)::INTEGER as avg_tokens_per_request,
    AVG(context_tokens)::INTEGER as avg_context_tokens,

    -- Context window utilization (assuming 128k context window for GPT-4)
    AVG(CASE WHEN context_tokens IS NOT NULL THEN (context_tokens::DECIMAL / 128000 * 100) END)::DECIMAL(5,2) as avg_context_utilization_percent,
    MAX(context_tokens) as max_context_tokens,

    -- Response times
    AVG(response_time_ms)::INTEGER as avg_response_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::INTEGER as p95_response_time_ms,
    MAX(response_time_ms) as max_response_time_ms,

    -- Architecture breakdown (last 7 days)
    COUNT(CASE WHEN architecture = 'two_pass' AND created_at > NOW() - INTERVAL '7 days' THEN 1 END) as two_pass_requests_7d,
    COUNT(CASE WHEN architecture = 'single_pass' AND created_at > NOW() - INTERVAL '7 days' THEN 1 END) as single_pass_requests_7d,

    -- Tool usage (last 7 days)
    SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN tool_calls_count ELSE 0 END) as total_tool_calls_7d,

    -- Cost
    SUM(estimated_cost_cents) / 100.0 as total_cost_usd,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN estimated_cost_cents ELSE 0 END) / 100.0 as cost_24h_usd,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN estimated_cost_cents ELSE 0 END) / 100.0 as cost_7d_usd
FROM token_usage
WHERE request_type IN ('agent', 'chat', 'analysis');

-- Intent Distribution View (last 30 days)
CREATE OR REPLACE VIEW agent_intent_distribution AS
SELECT
    intent,
    COUNT(*) as request_count,
    AVG(intent_confidence)::DECIMAL(3,2) as avg_confidence,
    AVG(total_tokens)::INTEGER as avg_tokens,
    AVG(response_time_ms)::INTEGER as avg_response_time_ms,
    SUM(estimated_cost_cents) / 100.0 as total_cost_usd
FROM token_usage
WHERE created_at > NOW() - INTERVAL '30 days'
  AND intent IS NOT NULL
GROUP BY intent
ORDER BY request_count DESC;

-- Model Usage View
CREATE OR REPLACE VIEW agent_model_usage AS
SELECT
    model,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    AVG(total_tokens)::INTEGER as avg_tokens,
    SUM(estimated_cost_cents) / 100.0 as total_cost_usd,
    AVG(response_time_ms)::INTEGER as avg_response_time_ms
FROM token_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY model
ORDER BY request_count DESC;

-- Daily Agent Metrics View (for charts)
CREATE OR REPLACE VIEW agent_daily_metrics AS
SELECT
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
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Recent Agent Requests View (for detailed table)
CREATE OR REPLACE VIEW agent_recent_requests AS
SELECT
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
LIMIT 100;

COMMENT ON VIEW agent_analytics_summary IS 'Summary statistics for agent performance monitoring';
COMMENT ON VIEW agent_intent_distribution IS 'Distribution of requests by intent type';
COMMENT ON VIEW agent_model_usage IS 'Token and cost breakdown by model';
COMMENT ON VIEW agent_daily_metrics IS 'Daily metrics for trend charts';
COMMENT ON VIEW agent_recent_requests IS 'Recent agent requests with full details';
