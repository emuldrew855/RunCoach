-- Add onboarding_completed field to track if user has completed the onboarding wizard
ALTER TABLE users
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Set existing users as completed (they don't need onboarding)
UPDATE users SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_completed) WHERE onboarding_completed = false;
