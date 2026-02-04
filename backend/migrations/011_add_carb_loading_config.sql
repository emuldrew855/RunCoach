-- Add carb loading configuration to training_plans table
ALTER TABLE training_plans
ADD COLUMN IF NOT EXISTS enable_carb_loading BOOLEAN DEFAULT false;

COMMENT ON COLUMN training_plans.enable_carb_loading IS 'Whether to identify and highlight carb-loading periods before key workouts';
