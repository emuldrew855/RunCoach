-- Migration 027: Add Runner Tendencies Table
--
-- Tracks persistent behavioral patterns that the coach should remember.
-- Updated every 2 weeks by analyzing the last 6 weeks of training data.
--
-- This enables coaching like:
-- "You've exceeded your Z2 target in 4 of your last 6 easy runs - that's a pattern."

-- Runner Tendencies Table
CREATE TABLE IF NOT EXISTS runner_tendencies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tendency_type VARCHAR(50) NOT NULL, -- 'pacing', 'hr_management', 'volume', 'compliance'

  -- Pacing behavior patterns
  pacing_behavior JSONB,
  -- Schema:
  -- {
  --   "startsTooFast": {
  --     "frequency": 70,  // % of runs
  --     "avgFadePercent": 12.5,
  --     "lastOccurrence": "2024-02-08"
  --   },
  --   "negativeSplitAbility": {
  --     "frequency": 30,  // % of runs
  --     "avgImprovement": 5.2  // % faster second half
  --   },
  --   "targetPaceAccuracy": {
  --     "avgDeviation": 8.3,  // %
  --     "direction": "too_fast"  // or "too_slow" or "accurate"
  --   }
  -- }

  -- HR management patterns
  hr_management JSONB,
  -- Schema:
  -- {
  --   "easyRunIntensity": {
  --     "avgZone": 2.8,
  --     "shouldBe": 2.0,
  --     "issueFrequency": 75  // % of easy runs too hard
  --   },
  --   "effortCalibration": {
  --     "hrPaceMismatch": 60,  // % of runs
  --     "typicalIssue": "hr_too_high"  // or "hr_too_low" or "well_calibrated"
  --   }
  -- }

  -- Volume management patterns
  volume_behavior JSONB,
  -- Schema:
  -- {
  --   "buildupPattern": {
  --     "avgWeeklyIncrease": 12.5,  // %
  --     "exceedsGuideline": 60,  // % of weeks exceeding 10%
  --     "crashPattern": true  // Big increase followed by injury/skip
  --   },
  --   "recoveryAdherence": {
  --     "takesRestDays": true,
  --     "avgRecoveryDaysPerWeek": 1.5,
  --     "recoveryRunQuality": "too_hard"  // or "appropriate" or "too_easy"
  --   }
  -- }

  -- Compliance patterns
  compliance_behavior JSONB,
  -- Schema:
  -- {
  --   "workoutSkipping": {
  --     "frequency": 15,  // % of planned workouts
  --     "skippedTypes": ["tempo", "intervals"],
  --     "skippingPattern": "Skips hard workouts when fatigued"
  --   },
  --   "planModifications": {
  --     "frequency": 30,  // % modified
  --     "typicalChanges": ["Shortens distances", "Slows paces"],
  --     "requestsEasierWorkouts": true
  --   }
  -- }

  -- Observation metadata
  observation_start DATE NOT NULL,
  observation_end DATE NOT NULL,
  activities_analyzed INTEGER NOT NULL,
  confidence_score DECIMAL(3,2), -- 0.00-1.00 (higher = more data)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- One tendency record per type per user
  UNIQUE(user_id, tendency_type)
);

CREATE INDEX IF NOT EXISTS idx_runner_tendencies_user ON runner_tendencies(user_id);
CREATE INDEX IF NOT EXISTS idx_runner_tendencies_updated ON runner_tendencies(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_runner_tendencies_type ON runner_tendencies(user_id, tendency_type);

COMMENT ON TABLE runner_tendencies IS 'Persistent behavioral patterns tracked over 4-6 week windows. Enables specific coaching like "You start too fast in 70% of runs."';
COMMENT ON COLUMN runner_tendencies.tendency_type IS 'Category: pacing, hr_management, volume, compliance';
COMMENT ON COLUMN runner_tendencies.pacing_behavior IS 'Fast starts, negative splits, target pace accuracy patterns';
COMMENT ON COLUMN runner_tendencies.hr_management IS 'Easy run intensity, effort calibration issues';
COMMENT ON COLUMN runner_tendencies.volume_behavior IS 'Weekly buildup patterns, recovery adherence';
COMMENT ON COLUMN runner_tendencies.compliance_behavior IS 'Workout skipping, plan modification patterns';
COMMENT ON COLUMN runner_tendencies.confidence_score IS 'Data quality score 0-1 (based on sample size and consistency)';
