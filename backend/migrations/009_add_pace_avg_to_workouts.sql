-- Add target_pace_avg column to planned_workouts table
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS target_pace_avg DECIMAL(6,2);

-- Add comment to explain the field
COMMENT ON COLUMN planned_workouts.target_pace_avg IS 'Target average pace in min/km (e.g. 5.5 = 5:30/km)';
