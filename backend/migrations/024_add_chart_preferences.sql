-- Add chart preferences to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS chart_preferences JSONB DEFAULT '{
  "historicalWeeks": 16,
  "futureWeeks": 4,
  "chartType": "bar",
  "dataView": "both",
  "showAverage": true
}'::jsonb;

COMMENT ON COLUMN user_profiles.chart_preferences IS 'User preferences for training volume chart display';
