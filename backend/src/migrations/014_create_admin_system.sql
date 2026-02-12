-- Migration: Create Admin System Tables
-- Description: Add admin functionality including user analytics, sessions, audit logs, and impersonation
-- Idempotent: Can be run multiple times safely

-- Add is_admin flag to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

COMMENT ON COLUMN users.is_admin IS 'Flag indicating if user has admin privileges';
COMMENT ON COLUMN users.admin_notes IS 'Internal notes about this user (visible only to admins)';

-- User Sessions Table (for session analytics)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,

    duration_seconds INTEGER, -- Calculated on session end
    page_views INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,

    user_agent TEXT,
    ip_address VARCHAR(45), -- Supports IPv6
    device_type VARCHAR(50), -- 'mobile', 'tablet', 'desktop'
    browser VARCHAR(100),

    entry_page VARCHAR(255),
    exit_page VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_duration ON user_sessions(duration_seconds);

-- Admin Audit Log (track all admin actions)
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    action_type VARCHAR(50) NOT NULL, -- 'view_user', 'impersonate', 'modify_user', 'view_analytics', etc.
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    action_details JSONB, -- Additional context about the action
    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- API Telemetry (track API performance and usage)
CREATE TABLE IF NOT EXISTS api_telemetry (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,

    method VARCHAR(10) NOT NULL, -- GET, POST, PUT, DELETE
    endpoint VARCHAR(255) NOT NULL,
    status_code INTEGER NOT NULL,

    response_time_ms INTEGER, -- Response time in milliseconds
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,

    error_message TEXT,
    error_stack TEXT,

    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partition by date for performance (optional, can be added later)
CREATE INDEX IF NOT EXISTS idx_api_telemetry_user_id ON api_telemetry(user_id);
CREATE INDEX IF NOT EXISTS idx_api_telemetry_endpoint ON api_telemetry(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_telemetry_status_code ON api_telemetry(status_code);
CREATE INDEX IF NOT EXISTS idx_api_telemetry_created_at ON api_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_telemetry_errors ON api_telemetry(status_code) WHERE status_code >= 400;

-- User Impersonation Tokens (temporary tokens for admin to login as user)
CREATE TABLE IF NOT EXISTS impersonation_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,

    reason TEXT, -- Why admin is impersonating this user
    ip_address VARCHAR(45),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_admin ON impersonation_tokens(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_target ON impersonation_tokens(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_token ON impersonation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_expires ON impersonation_tokens(expires_at);

-- User Analytics Summary View (for fast dashboard queries)
CREATE OR REPLACE VIEW user_analytics_summary AS
SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.created_at as user_since,
    u.last_login_at,

    -- Session stats
    COUNT(DISTINCT s.id) as total_sessions,
    COALESCE(AVG(s.duration_seconds), 0) as avg_session_duration_seconds,
    MAX(s.last_activity_at) as last_session,

    -- Activity stats
    COALESCE(SUM(s.page_views), 0) as total_page_views,
    COALESCE(SUM(s.api_calls), 0) as total_api_calls,

    -- Training data
    (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id) as total_activities,
    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.user_id = u.id) as total_chat_messages,
    (SELECT COUNT(*) FROM pending_actions pa WHERE pa.user_id = u.id AND pa.status = 'pending') as pending_actions_count

FROM users u
LEFT JOIN user_sessions s ON s.user_id = u.id
GROUP BY u.id, u.first_name, u.last_name, u.email, u.created_at, u.last_login_at;

-- System-wide analytics view
CREATE OR REPLACE VIEW system_analytics AS
SELECT
    -- User counts
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d,
    (SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '24 hours') as active_users_24h,
    (SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '7 days') as active_users_7d,

    -- Session stats
    (SELECT COUNT(*) FROM user_sessions WHERE started_at > NOW() - INTERVAL '24 hours') as sessions_24h,
    (SELECT AVG(duration_seconds) FROM user_sessions WHERE started_at > NOW() - INTERVAL '7 days') as avg_session_duration_7d,

    -- Activity stats
    (SELECT COUNT(*) FROM activities WHERE created_at > NOW() - INTERVAL '7 days') as activities_synced_7d,
    (SELECT COUNT(*) FROM chat_messages WHERE created_at > NOW() - INTERVAL '7 days') as chat_messages_7d,
    (SELECT COUNT(*) FROM pending_actions WHERE status = 'pending') as pending_actions_count,

    -- API stats
    (SELECT COUNT(*) FROM api_telemetry WHERE created_at > NOW() - INTERVAL '24 hours') as api_calls_24h,
    (SELECT AVG(response_time_ms) FROM api_telemetry WHERE created_at > NOW() - INTERVAL '24 hours') as avg_response_time_24h,
    (SELECT COUNT(*) FROM api_telemetry WHERE created_at > NOW() - INTERVAL '24 hours' AND status_code >= 400) as api_errors_24h,

    -- Database size
    (SELECT pg_size_pretty(pg_database_size(current_database()))) as database_size;

-- Function to update session last activity
CREATE OR REPLACE FUNCTION update_session_activity(session_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE user_sessions
    SET last_activity_at = NOW(),
        api_calls = api_calls + 1
    WHERE id = session_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to end session
CREATE OR REPLACE FUNCTION end_session(session_uuid UUID)
RETURNS void AS $$
BEGIN
    UPDATE user_sessions
    SET ended_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
    WHERE id = session_uuid AND ended_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE user_sessions IS 'Tracks user sessions for analytics and debugging';
COMMENT ON TABLE admin_audit_log IS 'Audit trail of all admin actions for security and compliance';
COMMENT ON TABLE api_telemetry IS 'API performance and error tracking for monitoring';
COMMENT ON TABLE impersonation_tokens IS 'Temporary tokens allowing admins to login as users for debugging';
COMMENT ON VIEW user_analytics_summary IS 'Aggregated user analytics for admin dashboard';
COMMENT ON VIEW system_analytics IS 'System-wide metrics for admin overview';
