-- Create user_profiles table for storing personal data
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    age INTEGER,
    weight_kg DECIMAL(5,2),
    height_cm INTEGER,
    gender VARCHAR(20),
    running_experience_years INTEGER,
    typical_weekly_mileage DECIMAL(5,2),
    injury_history TEXT,
    preferred_units VARCHAR(10) DEFAULT 'metric', -- 'metric' or 'imperial'
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
