-- Migration 023: Add occurrence_count to workout_insights
--
-- Adds occurrence_count column to workout_insights table for memory consolidation.
-- This allows tracking how many times a similar insight has been observed.

-- Add occurrence_count column to workout_insights
ALTER TABLE workout_insights
ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1;

-- Add last_seen timestamp for tracking when insight was last observed
ALTER TABLE workout_insights
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update comment
COMMENT ON COLUMN workout_insights.occurrence_count IS 'Number of times this insight has been observed. Incremented during memory consolidation when duplicate insights are merged.';
COMMENT ON COLUMN workout_insights.last_seen IS 'Timestamp when this insight was last observed or referenced.';
