-- Add coach style preferences to user profiles
-- Migration: 018_add_coach_style_preferences.sql

-- Add coach_style column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS coach_style VARCHAR(50) DEFAULT 'supportive';

-- Add coach_strictness_level column (1-5 scale)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS coach_strictness_level INTEGER DEFAULT 3 CHECK (coach_strictness_level BETWEEN 1 AND 5);

-- Add coach_communication_style column
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS coach_communication_style VARCHAR(50) DEFAULT 'balanced';

COMMENT ON COLUMN user_profiles.coach_style IS 'Coach personality type: strict, supportive, analytical, motivational';
COMMENT ON COLUMN user_profiles.coach_strictness_level IS 'How strict the coach is (1=very forgiving, 5=very strict)';
COMMENT ON COLUMN user_profiles.coach_communication_style IS 'Communication style: casual, balanced, professional';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_coach_style ON user_profiles(coach_style);
