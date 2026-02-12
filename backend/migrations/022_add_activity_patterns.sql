-- Migration 022: Add Activity Pattern Extraction Column
--
-- Adds extracted_patterns JSONB column to activities table to store automatically
-- extracted pacing, HR, cadence, and elevation patterns.
--
-- Patterns are extracted during activity sync and used for:
-- - Coaching context and personalized feedback
-- - Pattern embeddings for semantic search
-- - Long-term training behavior analysis

-- Add patterns column to activities table
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS extracted_patterns JSONB DEFAULT '{}';

-- Create GIN index for efficient JSONB queries
-- This allows fast pattern-based queries like:
-- SELECT * FROM activities WHERE extracted_patterns @> '{"pacing": {"type": "negative_split"}}'
CREATE INDEX IF NOT EXISTS idx_activities_extracted_patterns
ON activities USING GIN (extracted_patterns);

-- Add index for activities without extracted patterns (for backfill queries)
CREATE INDEX IF NOT EXISTS idx_activities_missing_patterns
ON activities(id)
WHERE extracted_patterns = '{}' OR extracted_patterns IS NULL;

-- Add occurrence_count column to activity_patterns for tracking pattern frequency
ALTER TABLE activity_patterns
ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1;

-- Add unique constraint to prevent duplicate patterns (needed for ON CONFLICT in service)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_pattern_text'
  ) THEN
    ALTER TABLE activity_patterns
    ADD CONSTRAINT unique_user_pattern_text UNIQUE (user_id, pattern_text);
  END IF;
END $$;

-- Update table and column comments
COMMENT ON COLUMN activities.extracted_patterns IS 'Automatically extracted patterns: pacing (type, consistency), HR behavior (intensity, zones), cadence (pattern, avg), elevation impact. Used for coaching context and semantic memory search.';

COMMENT ON COLUMN activity_patterns.occurrence_count IS 'Number of times this pattern has been observed across activities. Incremented on each occurrence.';

-- Example extracted_patterns structure:
-- {
--   "pacing": {
--     "type": "negative_split",
--     "consistency_score": 0.92,
--     "first_half_pace": 5.45,
--     "second_half_pace": 5.25
--   },
--   "hr_behavior": {
--     "avg_zone": 2.8,
--     "intensity_level": "moderate",
--     "zone_distribution": {
--       "zone1": 0.10,
--       "zone2": 0.45,
--       "zone3": 0.30,
--       "zone4": 0.12,
--       "zone5": 0.03
--     }
--   },
--   "cadence": {
--     "pattern": "stable",
--     "consistency_score": 0.85,
--     "avg_cadence": 175
--   },
--   "elevation_impact": {
--     "pace_impact_percent": 8.5,
--     "effort_multiplier": 1.09
--   }
-- }
