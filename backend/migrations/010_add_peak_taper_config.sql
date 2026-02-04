-- Add peak week and taper configuration to training_plans table
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS identify_peaks BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS taper_weeks INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS peak_week_number INTEGER,
ADD COLUMN IF NOT EXISTS taper_start_date DATE;

COMMENT ON COLUMN training_plans.identify_peaks IS 'Whether to identify and highlight peak weeks and taper period';
COMMENT ON COLUMN training_plans.taper_weeks IS 'Number of weeks for taper period (2-3)';
COMMENT ON COLUMN training_plans.peak_week_number IS 'Week number of the peak week (highest volume)';
COMMENT ON COLUMN training_plans.taper_start_date IS 'Start date of taper period';
