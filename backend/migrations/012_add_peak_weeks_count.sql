-- Add configurable number of peak weeks to highlight
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS peak_weeks_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS peak_week_numbers INTEGER[] DEFAULT ARRAY[]::INTEGER[];

COMMENT ON COLUMN training_plans.peak_weeks_count IS 'Number of peak weeks to highlight (1-3)';
COMMENT ON COLUMN training_plans.peak_week_numbers IS 'Array of week numbers for peak weeks (highest volume weeks)';

-- Remove old single peak_week_number column (we have peak_week_numbers array now)
-- ALTER TABLE training_plans DROP COLUMN IF EXISTS peak_week_number;
