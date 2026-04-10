-- Migration 029: Add Custom Heart Rate Zones to User Profile
--
-- Allows users to customize their HR zones based on their actual physiology
-- rather than using generic/standard zones.
--
-- Standard zones (defaults):
-- Zone 1 (Recovery): <120 bpm
-- Zone 2 (Easy/Aerobic): 120-140 bpm
-- Zone 3 (Moderate/Tempo): 140-160 bpm
-- Zone 4 (Hard/Threshold): 160-175 bpm
-- Zone 5 (Max Effort): >175 bpm
--
-- Users can override these based on Strava zones or lab testing.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS hr_zone_1_max INTEGER DEFAULT 120,
ADD COLUMN IF NOT EXISTS hr_zone_2_max INTEGER DEFAULT 140,
ADD COLUMN IF NOT EXISTS hr_zone_3_max INTEGER DEFAULT 160,
ADD COLUMN IF NOT EXISTS hr_zone_4_max INTEGER DEFAULT 175,
ADD COLUMN IF NOT EXISTS hr_zone_5_max INTEGER DEFAULT 220;

COMMENT ON COLUMN user_profiles.hr_zone_1_max IS 'Upper bound of HR Zone 1 (Recovery) in bpm. Default: 120';
COMMENT ON COLUMN user_profiles.hr_zone_2_max IS 'Upper bound of HR Zone 2 (Easy/Aerobic) in bpm. Default: 140';
COMMENT ON COLUMN user_profiles.hr_zone_3_max IS 'Upper bound of HR Zone 3 (Moderate/Tempo) in bpm. Default: 160';
COMMENT ON COLUMN user_profiles.hr_zone_4_max IS 'Upper bound of HR Zone 4 (Hard/Threshold) in bpm. Default: 175';
COMMENT ON COLUMN user_profiles.hr_zone_5_max IS 'Upper bound of HR Zone 5 (Max Effort) in bpm. Default: 220 (effectively no upper limit)';

-- Update any existing NULL values to defaults
UPDATE user_profiles
SET
  hr_zone_1_max = COALESCE(hr_zone_1_max, 120),
  hr_zone_2_max = COALESCE(hr_zone_2_max, 140),
  hr_zone_3_max = COALESCE(hr_zone_3_max, 160),
  hr_zone_4_max = COALESCE(hr_zone_4_max, 175),
  hr_zone_5_max = COALESCE(hr_zone_5_max, 220);
