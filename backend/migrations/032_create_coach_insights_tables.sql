-- Migration 032: Create Coach Insights Tables
-- Powers the "Coach's Note" dashboard widget with AI-generated daily insights

-- Table for caching daily coach insights
CREATE TABLE IF NOT EXISTS coach_daily_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_data JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_daily_insights_user_id ON coach_daily_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_daily_insights_generated_at ON coach_daily_insights(generated_at);

-- Table for tracking when users dismiss insights
CREATE TABLE IF NOT EXISTS coach_insight_dismissals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_until TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_insight_dismissals_user_id ON coach_insight_dismissals(user_id);

COMMENT ON TABLE coach_daily_insights IS 'Cached AI-generated daily coaching insights for dashboard widget';
COMMENT ON TABLE coach_insight_dismissals IS 'Tracks when users dismiss the daily insight until tomorrow';
