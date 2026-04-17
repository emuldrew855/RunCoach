-- Migration 040: Add processed_splits column for per-km analysis
--
-- This stores bucketed split data with HR correlation for each kilometer.
-- The data is computed from Strava streams and cached for fast access.
--
-- Structure:
-- {
--   "splits": [
--     { "km": 1, "pace": "4:32", "avg_hr": 145, "intensity_zone": 2, ... },
--     { "km": 2, "pace": "4:35", "avg_hr": 148, "intensity_zone": 2, ... }
--   ],
--   "analysis": {
--     "fastest_km": { "km": 3, "pace": "4:28" },
--     "slowest_km": { "km": 8, "pace": "4:55" },
--     "hr_drift_percent": 5.2,
--     "fade_point_km": 7
--   }
-- }

-- Add processed_splits column to activities table
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS processed_splits JSONB;

-- Add timestamp for when splits were processed
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS splits_processed_at TIMESTAMP;

-- Create index for querying activities with/without processed splits
CREATE INDEX IF NOT EXISTS idx_activities_splits_processed
ON activities(id, splits_processed_at)
WHERE splits_processed_at IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN activities.processed_splits IS 'Per-km bucketed splits with HR, pace, elevation data - computed from Strava streams';
COMMENT ON COLUMN activities.splits_processed_at IS 'Timestamp when processed_splits was last computed';
