-- Migration 035: Add Runner Intent Fields
-- Description: Support User-Intent First coaching model with runner types and baseline metrics

-- Add runner intent fields to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS runner_type VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_focus TEXT,
ADD COLUMN IF NOT EXISTS runner_type_inferred BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS runner_type_set_at TIMESTAMP;

-- Add check constraint for runner_type values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_runner_type_check'
    ) THEN
        ALTER TABLE user_profiles
        ADD CONSTRAINT user_profiles_runner_type_check
        CHECK (runner_type IS NULL OR runner_type IN ('architect', 'builder', 'maintainer'));
    END IF;
END $$;

-- Create baseline_metrics table for trend tracking
-- This stores weekly snapshots and rolling averages for users without structured plans
CREATE TABLE IF NOT EXISTS baseline_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,

    -- Volume metrics for this week
    total_distance_km NUMERIC(8,2),
    run_count INTEGER,
    longest_run_km NUMERIC(8,2),
    total_duration_seconds INTEGER,

    -- Performance metrics for this week
    avg_pace_min_km NUMERIC(6,2),
    avg_hr INTEGER,

    -- Intensity distribution (% of time)
    zone_1_2_percent INTEGER,
    zone_3_percent INTEGER,
    zone_4_5_percent INTEGER,

    -- 4-week rolling averages (computed from last 4 weeks including this one)
    rolling_avg_distance_km NUMERIC(8,2),
    rolling_avg_runs_per_week NUMERIC(4,1),
    rolling_avg_longest_run_km NUMERIC(8,2),
    rolling_avg_pace_min_km NUMERIC(6,2),

    -- Trend indicators (% change from 4 weeks ago to now)
    distance_trend_percent NUMERIC(5,1),
    pace_trend_percent NUMERIC(5,1),

    -- Metadata
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, week_start)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_baseline_metrics_user_week
    ON baseline_metrics(user_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_user_profiles_runner_type
    ON user_profiles(runner_type)
    WHERE runner_type IS NOT NULL;

-- Add comments
COMMENT ON COLUMN user_profiles.runner_type IS 'User archetype: architect (race-focused), builder (improving), maintainer (fitness)';
COMMENT ON COLUMN user_profiles.current_focus IS 'Free-text current training focus (e.g., "Building weekly mileage", "Marathon prep")';
COMMENT ON COLUMN user_profiles.runner_type_inferred IS 'True if runner_type was auto-inferred from activity data rather than user-selected';
COMMENT ON COLUMN user_profiles.runner_type_set_at IS 'When runner_type was last set or updated';

COMMENT ON TABLE baseline_metrics IS 'Weekly baseline metrics for all users, enabling trend comparison and plan-less coaching';
COMMENT ON COLUMN baseline_metrics.rolling_avg_distance_km IS '4-week rolling average of weekly distance';
COMMENT ON COLUMN baseline_metrics.distance_trend_percent IS 'Percent change in distance from 4 weeks ago to current week';
