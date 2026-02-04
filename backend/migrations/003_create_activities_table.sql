-- Create activities table for storing Strava running data
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    strava_activity_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(255),
    distance_meters DECIMAL(10,2),
    moving_time_seconds INTEGER,
    elapsed_time_seconds INTEGER,
    total_elevation_gain_meters DECIMAL(8,2),
    sport_type VARCHAR(50), -- 'Run', 'TrailRun', 'VirtualRun'
    start_date TIMESTAMP NOT NULL,
    start_date_local TIMESTAMP,
    timezone VARCHAR(50),
    average_speed DECIMAL(5,2), -- meters/second
    max_speed DECIMAL(5,2),
    average_heartrate DECIMAL(5,2),
    max_heartrate INTEGER,
    average_cadence DECIMAL(5,2),
    calories DECIMAL(8,2),
    description TEXT,
    suffer_score INTEGER, -- Strava's relative effort
    perceived_exertion INTEGER, -- 1-10 scale, user-added
    workout_type INTEGER, -- Strava workout type
    gear_id VARCHAR(50),
    map_polyline TEXT, -- Encoded polyline for route visualization
    splits_metric JSONB, -- Kilometer splits
    splits_standard JSONB, -- Mile splits
    laps JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_strava_id ON activities(strava_activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_sport_type ON activities(sport_type);
