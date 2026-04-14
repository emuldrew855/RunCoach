-- Migration: Fix User Analytics Summary View
-- Description: Updates the view to show more accurate engagement data
-- The original view relied on user_sessions which weren't being tracked properly.
-- This version uses api_telemetry for engagement metrics directly.

-- Drop existing view first to allow column changes
DROP VIEW IF EXISTS user_analytics_summary;

CREATE VIEW user_analytics_summary AS
SELECT
    u.id,
    u.strava_id,
    u.first_name,
    u.last_name,
    u.email,
    u.profile_picture_url,
    u.created_at,
    u.last_login_at,
    u.is_admin,

    -- Session stats from user_sessions (if any exist)
    COALESCE((SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id), 0)::BIGINT as total_sessions,
    COALESCE((SELECT AVG(duration_seconds) FROM user_sessions s WHERE s.user_id = u.id AND duration_seconds IS NOT NULL), 0)::NUMERIC as avg_session_duration_seconds,
    (SELECT MAX(last_activity_at) FROM user_sessions s WHERE s.user_id = u.id) as last_session,

    -- Use API telemetry for more accurate page views/api calls
    COALESCE((SELECT COUNT(*) FROM api_telemetry t WHERE t.user_id = u.id), 0)::BIGINT as total_page_views,
    COALESCE((SELECT COUNT(*) FROM api_telemetry t WHERE t.user_id = u.id), 0)::BIGINT as total_api_calls,

    -- Training data - direct counts (these should be accurate)
    (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id)::BIGINT as total_activities,
    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.user_id = u.id)::BIGINT as total_chat_messages,
    (SELECT COUNT(*) FROM pending_actions pa WHERE pa.user_id = u.id AND pa.status = 'pending')::BIGINT as pending_actions_count,

    -- Additional useful metrics
    (SELECT COUNT(*) FROM training_plans tp WHERE tp.user_id = u.id)::BIGINT as total_training_plans,
    (SELECT COUNT(*) FROM planned_workouts pw
     JOIN training_plans tp ON pw.training_plan_id = tp.id
     WHERE tp.user_id = u.id)::BIGINT as total_planned_workouts,
    (SELECT MAX(a.start_date) FROM activities a WHERE a.user_id = u.id) as last_activity_date

FROM users u;

COMMENT ON VIEW user_analytics_summary IS 'Aggregated user analytics for admin dashboard - updated to use api_telemetry for engagement metrics';
