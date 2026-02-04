-- Add week_starts_on preference to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS week_starts_on VARCHAR(10) DEFAULT 'sunday'; -- 'sunday' or 'monday'

COMMENT ON COLUMN user_profiles.week_starts_on IS 'User preference for calendar week start day';
