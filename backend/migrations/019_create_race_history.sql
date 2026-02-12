-- Create race history table for tracking previous races and personal bests
-- Migration: 019_create_race_history.sql

CREATE TABLE IF NOT EXISTS race_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  race_name VARCHAR(255) NOT NULL,
  race_date DATE NOT NULL,
  race_type VARCHAR(50) NOT NULL, -- '5k', '10k', 'half_marathon', 'marathon', etc.
  finish_time_seconds INTEGER NOT NULL,
  race_location VARCHAR(255),
  race_notes TEXT,
  is_personal_best BOOLEAN DEFAULT FALSE,
  placement INTEGER, -- Overall placement (optional)
  age_group_placement INTEGER, -- Age group placement (optional)
  weather_conditions VARCHAR(100), -- e.g., "Hot and humid", "Cool and windy"
  elevation_gain_meters INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_race_history_user_id ON race_history(user_id);
CREATE INDEX IF NOT EXISTS idx_race_history_race_type ON race_history(race_type);
CREATE INDEX IF NOT EXISTS idx_race_history_is_pb ON race_history(is_personal_best);
CREATE INDEX IF NOT EXISTS idx_race_history_date ON race_history(race_date DESC);

COMMENT ON TABLE race_history IS 'Historical race performances and personal bests for each user';
COMMENT ON COLUMN race_history.is_personal_best IS 'Whether this race represents a PR for this distance';
COMMENT ON COLUMN race_history.race_type IS 'Race distance: 5k, 10k, 15k, half_marathon, marathon, ultra, etc.';
