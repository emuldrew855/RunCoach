-- Training Plans Table
CREATE TABLE IF NOT EXISTS training_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_weeks INTEGER,
    source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'csv_upload', 'pdf_upload'
    file_metadata JSONB, -- Store original filename, upload date, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Planned Workouts Table
CREATE TABLE IF NOT EXISTS planned_workouts (
    id SERIAL PRIMARY KEY,
    training_plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    workout_type VARCHAR(50) NOT NULL, -- 'easy', 'long_run', 'tempo', 'intervals', 'recovery', 'race', 'rest'
    name VARCHAR(255),
    description TEXT,

    -- Basic workout details
    target_distance_meters DECIMAL(10,2),
    target_duration_seconds INTEGER,

    -- Pace zones (stored in min/km as decimal, e.g. 5.5 = 5:30/km)
    target_pace_min DECIMAL(6,2),
    target_pace_max DECIMAL(6,2),

    -- Heart rate zones (using standard 5-zone system)
    target_hr_zone INTEGER, -- 1-5
    target_hr_min INTEGER, -- bpm
    target_hr_max INTEGER, -- bpm

    -- Interval workout structure
    intervals JSONB, -- Structure: [{ reps: 5, distance: 1000, pace: 4.5, recovery_time: 120, recovery_type: 'jog' }]

    -- Completion tracking
    completed_activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
    completion_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'skipped', 'partial'
    completed_at TIMESTAMP,

    -- Notes
    coach_notes TEXT,
    athlete_notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HR Zone Time Table (for detailed analysis)
CREATE TABLE IF NOT EXISTS activity_hr_zones (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Time spent in each zone (seconds)
    zone_1_seconds INTEGER DEFAULT 0,
    zone_2_seconds INTEGER DEFAULT 0,
    zone_3_seconds INTEGER DEFAULT 0,
    zone_4_seconds INTEGER DEFAULT 0,
    zone_5_seconds INTEGER DEFAULT 0,

    -- Zone definitions used (stored for historical accuracy)
    zone_1_max INTEGER, -- bpm
    zone_2_max INTEGER,
    zone_3_max INTEGER,
    zone_4_max INTEGER,
    zone_5_max INTEGER, -- typically max HR

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for training_plans
CREATE INDEX IF NOT EXISTS idx_training_plans_user_id ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_goal_id ON training_plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_active ON training_plans(is_active) WHERE is_active = true;

-- Indexes for planned_workouts
CREATE INDEX IF NOT EXISTS idx_planned_workouts_plan_id ON planned_workouts(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_user_id ON planned_workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_date ON planned_workouts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_status ON planned_workouts(completion_status);

-- Indexes for activity_hr_zones
CREATE INDEX IF NOT EXISTS idx_activity_hr_zones_activity_id ON activity_hr_zones(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_hr_zones_user_id ON activity_hr_zones(user_id);
