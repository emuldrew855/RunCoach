-- Migration: Token Usage Tracking
-- Description: Track OpenAI token usage and costs for admin monitoring
-- Idempotent: Can be run multiple times safely

-- Token Usage Table
CREATE TABLE IF NOT EXISTS token_usage (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

    -- Token counts
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,

    -- Model info
    model VARCHAR(100) NOT NULL, -- e.g., 'gpt-4', 'gpt-3.5-turbo'

    -- Cost calculation (in USD cents)
    estimated_cost_cents DECIMAL(10, 2),

    -- Request type
    request_type VARCHAR(50), -- 'chat', 'analysis', 'agent_tool', etc.

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_usage_request_type ON token_usage(request_type);

-- Token Usage Summary View
CREATE OR REPLACE VIEW token_usage_summary AS
SELECT
    -- Totals
    COUNT(*) as total_requests,
    SUM(prompt_tokens) as total_prompt_tokens,
    SUM(completion_tokens) as total_completion_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(estimated_cost_cents) / 100.0 as total_cost_usd,

    -- Last 24 hours
    SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN total_tokens ELSE 0 END) as tokens_24h,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN estimated_cost_cents ELSE 0 END) / 100.0 as cost_24h_usd,

    -- Last 7 days
    SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN total_tokens ELSE 0 END) as tokens_7d,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN estimated_cost_cents ELSE 0 END) / 100.0 as cost_7d_usd,

    -- Last 30 days
    SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN total_tokens ELSE 0 END) as tokens_30d,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN estimated_cost_cents ELSE 0 END) / 100.0 as cost_30d_usd,

    -- By model (last 30 days)
    SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' AND model LIKE 'gpt-4%' THEN total_tokens ELSE 0 END) as gpt4_tokens_30d,
    SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' AND model LIKE 'gpt-3.5%' THEN total_tokens ELSE 0 END) as gpt35_tokens_30d,

    -- Average per request
    AVG(total_tokens) as avg_tokens_per_request,
    AVG(estimated_cost_cents) / 100.0 as avg_cost_per_request_usd
FROM token_usage;

-- User Token Usage View (for per-user tracking)
CREATE OR REPLACE VIEW user_token_usage AS
SELECT
    u.id as user_id,
    u.first_name,
    u.last_name,
    u.email,
    COUNT(tu.id) as total_requests,
    SUM(tu.total_tokens) as total_tokens,
    SUM(tu.estimated_cost_cents) / 100.0 as total_cost_usd,
    SUM(CASE WHEN tu.created_at > NOW() - INTERVAL '30 days' THEN tu.total_tokens ELSE 0 END) as tokens_30d,
    SUM(CASE WHEN tu.created_at > NOW() - INTERVAL '30 days' THEN tu.estimated_cost_cents ELSE 0 END) / 100.0 as cost_30d_usd
FROM users u
LEFT JOIN token_usage tu ON tu.user_id = u.id
GROUP BY u.id, u.first_name, u.last_name, u.email;

COMMENT ON TABLE token_usage IS 'Tracks OpenAI API token usage and estimated costs for monitoring';
COMMENT ON VIEW token_usage_summary IS 'Aggregated token usage statistics for admin dashboard';
COMMENT ON VIEW user_token_usage IS 'Per-user token usage and costs';
