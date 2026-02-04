-- Add training block start and end dates to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS training_block_start DATE,
ADD COLUMN IF NOT EXISTS training_block_end DATE;

COMMENT ON COLUMN user_profiles.training_block_start IS 'Start date of current training block';
COMMENT ON COLUMN user_profiles.training_block_end IS 'End date of current training block';
