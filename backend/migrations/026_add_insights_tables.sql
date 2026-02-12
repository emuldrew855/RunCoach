-- Migration 026: Add Insight Tables for Structured Analytics
--
-- This migration creates tables to store pre-computed running insights
-- that feed into the AI coach's context, enabling specific, data-driven feedback.
--
-- Tables:
-- 1. daily_run_insights: Per-activity analytics (pace, HR, compliance, risks)
-- 2. weekly_insights: Weekly aggregation (volume, adherence, patterns, guidance)

-- Daily Run Insights Table
-- Stores pre-computed performance analytics for each completed activity
CREATE TABLE IF NOT EXISTS daily_run_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,

  -- Pacing analysis: consistency, fade detection, split analysis
  pacing_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Heart rate behavior: drift, zone distribution, effort mismatch
  hr_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Effort assessment: perceived difficulty, execution score
  effort_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Compliance check: adherence to planned workout
  compliance_check JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Risk indicators: injury risk, overtraining signals
  risk_indicators JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Coaching points: strengths, improvements, next workout guidance
  coaching_points JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- One insight per activity
  UNIQUE(activity_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_insights_user_date ON daily_run_insights(user_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_insights_activity ON daily_run_insights(activity_id);

COMMENT ON TABLE daily_run_insights IS 'Pre-computed performance insights for each completed activity. Enables specific, data-driven coaching feedback without LLM calculation.';
COMMENT ON COLUMN daily_run_insights.pacing_analysis IS 'Pace consistency, fade analysis, split breakdown (JSONB: paceDelta, consistency, splitAnalysis)';
COMMENT ON COLUMN daily_run_insights.hr_behavior IS 'HR drift, zone distribution, effort mismatch (JSONB: avgZone, driftRate, effortMismatch)';
COMMENT ON COLUMN daily_run_insights.effort_analysis IS 'Perceived difficulty and execution score (JSONB: perceivedDifficulty, executionScore)';
COMMENT ON COLUMN daily_run_insights.compliance_check IS 'Plan adherence metrics (JSONB: completedAsPlanned, deviations, modifications)';
COMMENT ON COLUMN daily_run_insights.risk_indicators IS 'Injury and overtraining signals (JSONB: injuryRisk, overtrainingSignals)';
COMMENT ON COLUMN daily_run_insights.coaching_points IS 'Generated feedback points (JSONB: strengths, improvements, nextWorkoutAdjustment)';

-- Weekly Insights Table
-- Stores weekly training analysis computed every Sunday/Monday
CREATE TABLE IF NOT EXISTS weekly_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- Volume analysis: total, planned, week-over-week changes
  volume_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Adherence tracking: completion rate, skipped workouts
  adherence_tracking JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Pattern changes: pacing trends, HR trends, consistency
  pattern_changes JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Training load: intensity distribution, recovery days
  training_load JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Weekly risks: overtraining, injury, burnout indicators
  weekly_risks JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Next week guidance: volume recommendation, focus areas
  next_week_guidance JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- One insight per user per week
  UNIQUE(user_id, week_start)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_weekly_insights_user_week ON weekly_insights(user_id, week_start DESC);

COMMENT ON TABLE weekly_insights IS 'Pre-computed weekly training analysis. Computed Sunday evening, provides trend analysis and next week guidance.';
COMMENT ON COLUMN weekly_insights.volume_analysis IS 'Weekly volume metrics and trends (JSONB: totalDistance, weekOverWeekChange, volumeRisk)';
COMMENT ON COLUMN weekly_insights.adherence_tracking IS 'Workout completion metrics (JSONB: adherenceRate, skippedTypes, complianceScore)';
COMMENT ON COLUMN weekly_insights.pattern_changes IS 'Performance trends vs last week (JSONB: pacingTrend, hrTrend, consistencyChange)';
COMMENT ON COLUMN weekly_insights.training_load IS 'Intensity distribution and recovery (JSONB: intensityDistribution, recoveryDays)';
COMMENT ON COLUMN weekly_insights.weekly_risks IS 'Risk assessment for overtraining/injury (JSONB: overtrainingRisk, injuryRisk, indicators)';
COMMENT ON COLUMN weekly_insights.next_week_guidance IS 'Recommendations for upcoming week (JSONB: volumeRecommendation, focusAreas, workoutsToAdjust)';
