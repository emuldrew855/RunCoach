-- Add personal_bests to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS personal_bests JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profiles.personal_bests IS 'Personal best times in seconds for common race distances: 5k, 10k, 15k, half_marathon, marathon, 30k';
