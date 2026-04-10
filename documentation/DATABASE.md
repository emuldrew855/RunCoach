# Database Documentation

## Overview

PostgreSQL database with direct SQL queries (no ORM). Runs in Docker container.

**Database**: runcoach
**Port**: 5432
**User**: runcoach

## Schema

### users
User accounts with Strava OAuth tokens.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  strava_athlete_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  profile_picture VARCHAR(500),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  last_activity_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### user_profiles
Extended user settings and preferences.

```sql
CREATE TABLE user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  weight_kg DECIMAL(5,2),
  height_cm INTEGER,
  experience_level VARCHAR(50),  -- 'beginner', 'intermediate', 'advanced', 'elite'
  weekly_running_days INTEGER,
  max_heart_rate INTEGER,
  resting_heart_rate INTEGER,
  coach_style VARCHAR(50),       -- 'scientist', 'disciplinarian', 'encourager', 'inspirer'
  unit_preference VARCHAR(20),   -- 'metric', 'imperial'
  week_start VARCHAR(20),        -- 'sunday', 'monday'
  custom_hr_zones JSONB,         -- Custom HR zone definitions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### activities
Synced running activities from Strava.

```sql
CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  strava_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  type VARCHAR(50),              -- 'Run', 'TrailRun', 'VirtualRun', etc.
  distance DECIMAL(10,2),        -- meters
  moving_time INTEGER,           -- seconds
  elapsed_time INTEGER,          -- seconds
  total_elevation_gain DECIMAL(8,2),
  average_speed DECIMAL(6,3),    -- m/s
  max_speed DECIMAL(6,3),
  average_heartrate INTEGER,
  max_heartrate INTEGER,
  average_cadence DECIMAL(5,1),
  start_date TIMESTAMP NOT NULL,
  start_date_local TIMESTAMP,
  timezone VARCHAR(100),
  map_polyline TEXT,
  splits_metric JSONB,           -- Per-km split data
  laps JSONB,                    -- Lap data
  suffer_score INTEGER,
  calories INTEGER,
  description TEXT,
  workout_type INTEGER,          -- Strava workout type ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activities_user_date ON activities(user_id, start_date DESC);
CREATE INDEX idx_activities_strava_id ON activities(strava_id);
```

### activity_hr_zones
Heart rate zone distribution per activity.

```sql
CREATE TABLE activity_hr_zones (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  zone1_seconds INTEGER DEFAULT 0,
  zone2_seconds INTEGER DEFAULT 0,
  zone3_seconds INTEGER DEFAULT 0,
  zone4_seconds INTEGER DEFAULT 0,
  zone5_seconds INTEGER DEFAULT 0,
  zone1_percent DECIMAL(5,2) DEFAULT 0,
  zone2_percent DECIMAL(5,2) DEFAULT 0,
  zone3_percent DECIMAL(5,2) DEFAULT 0,
  zone4_percent DECIMAL(5,2) DEFAULT 0,
  zone5_percent DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_hr_zones_activity ON activity_hr_zones(activity_id);
CREATE INDEX idx_activity_hr_zones_user ON activity_hr_zones(user_id);
```

### training_plans
Training plan metadata.

```sql
CREATE TABLE training_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  source VARCHAR(50),            -- 'csv', 'pdf', 'manual'
  total_weeks INTEGER,
  peak_weeks JSONB,              -- Array of peak week numbers
  taper_weeks INTEGER,           -- Number of taper weeks before race
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_training_plans_user ON training_plans(user_id);
```

### planned_workouts
Individual planned workouts in a training plan.

```sql
CREATE TABLE planned_workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  training_plan_id INTEGER REFERENCES training_plans(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  workout_type VARCHAR(50) NOT NULL,  -- 'easy', 'tempo', 'interval', 'long', 'rest', 'race'
  target_distance DECIMAL(10,2),      -- meters
  target_duration INTEGER,            -- seconds
  target_pace_min DECIMAL(6,2),       -- min/km (lower bound)
  target_pace_max DECIMAL(6,2),       -- min/km (upper bound)
  target_hr_zone INTEGER,             -- 1-5
  description TEXT,
  intervals JSONB,                    -- Interval workout structure
  completion_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'completed', 'skipped'
  completed_activity_id INTEGER REFERENCES activities(id),
  actual_distance DECIMAL(10,2),
  actual_duration INTEGER,
  actual_pace DECIMAL(6,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_planned_workouts_user_date ON planned_workouts(user_id, scheduled_date);
CREATE INDEX idx_planned_workouts_status ON planned_workouts(completion_status);
CREATE INDEX idx_planned_workouts_plan ON planned_workouts(training_plan_id);
```

### race_goals
Target races with goal times.

```sql
CREATE TABLE race_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  race_name VARCHAR(255) NOT NULL,
  race_date DATE NOT NULL,
  race_distance DECIMAL(10,2) NOT NULL,  -- meters
  target_time INTEGER,                    -- seconds
  target_pace DECIMAL(6,2),               -- min/km
  priority VARCHAR(20) DEFAULT 'A',       -- 'A', 'B', 'C'
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_race_goals_user ON race_goals(user_id);
CREATE INDEX idx_race_goals_active ON race_goals(is_active);
```

### conversations
Chat conversations with AI coach.

```sql
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  context JSONB,                  -- Snapshot of context when created
  activity_id INTEGER REFERENCES activities(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_activity ON conversations(activity_id);
```

### messages
Individual messages in conversations.

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,      -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  tool_calls JSONB,               -- Tool calls made by assistant
  tool_results JSONB,             -- Results from tool execution
  model VARCHAR(100),             -- Model used for this message
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

### alerts
Training alerts and notifications.

```sql
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,    -- 'fatigue', 'volume', 'intensity', 'adherence'
  severity VARCHAR(20) NOT NULL,       -- 'info', 'warning', 'critical'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,                          -- Additional alert data
  is_dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_dismissed ON alerts(is_dismissed);
```

## JSONB Structures

### splits_metric (activities)
Per-kilometer split data from Strava.

```json
[
  {
    "distance": 1000,
    "elapsed_time": 285,
    "moving_time": 283,
    "average_speed": 3.54,
    "average_heartrate": 142,
    "pace_zone": 0,
    "split": 1
  }
]
```

### intervals (planned_workouts)
Interval workout structure.

```json
{
  "warmup": {
    "distance": 2000,
    "pace_zone": "easy"
  },
  "main": {
    "repeats": 6,
    "work": {
      "distance": 800,
      "pace_zone": "interval"
    },
    "recovery": {
      "distance": 400,
      "pace_zone": "easy"
    }
  },
  "cooldown": {
    "distance": 2000,
    "pace_zone": "easy"
  }
}
```

### custom_hr_zones (user_profiles)
Custom HR zone definitions.

```json
{
  "zone1": { "min": 0, "max": 120 },
  "zone2": { "min": 120, "max": 140 },
  "zone3": { "min": 140, "max": 155 },
  "zone4": { "min": 155, "max": 170 },
  "zone5": { "min": 170, "max": 220 }
}
```

### context (conversations)
Context snapshot when conversation started.

```json
{
  "goal": {
    "raceName": "London Marathon",
    "targetTime": "2:59:00",
    "daysUntilRace": 45
  },
  "activity": {
    "id": 123,
    "name": "Morning Run",
    "distance": 14400
  },
  "weekContext": {
    "startDate": "2026-03-02",
    "endDate": "2026-03-08",
    "workouts": [...]
  }
}
```

## Migrations

Located in `backend/migrations/`. Run sequentially on startup.

| Migration | Description |
|-----------|-------------|
| 001_initial_schema.sql | Users table |
| 002_add_activities.sql | Activities table |
| 003_add_training_plans.sql | Training plans + workouts |
| 004_add_race_goals.sql | Race goals |
| 005_add_conversations.sql | Conversations + messages |
| ... | ... |
| 029_add_custom_hr_zones.sql | Custom HR zones in profile |
| 030_add_last_activity_sync.sql | Last sync timestamp |

### Migration Pattern

```sql
-- Check if already applied
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'new_column'
  ) THEN
    ALTER TABLE users ADD COLUMN new_column VARCHAR(255);
  END IF;
END $$;
```

## Common Queries

### Get user activities (last 30 days)
```sql
SELECT * FROM activities
WHERE user_id = $1
  AND start_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY start_date DESC;
```

### Get upcoming workouts
```sql
SELECT * FROM planned_workouts
WHERE user_id = $1
  AND scheduled_date >= CURRENT_DATE
  AND completion_status = 'pending'
ORDER BY scheduled_date ASC
LIMIT 7;
```

### Get weekly volume
```sql
SELECT
  DATE_TRUNC('week', start_date) as week,
  SUM(distance) as total_distance,
  COUNT(*) as workout_count
FROM activities
WHERE user_id = $1
  AND start_date >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', start_date)
ORDER BY week DESC;
```

### Get plan adherence
```sql
SELECT
  COUNT(*) FILTER (WHERE completion_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE completion_status = 'skipped') as skipped,
  COUNT(*) FILTER (WHERE completion_status = 'pending' AND scheduled_date < CURRENT_DATE) as missed,
  COUNT(*) as total
FROM planned_workouts
WHERE user_id = $1
  AND scheduled_date >= CURRENT_DATE - INTERVAL '4 weeks'
  AND scheduled_date < CURRENT_DATE;
```

### Get HR zone distribution (4 weeks)
```sql
SELECT
  SUM(zone1_seconds) as z1,
  SUM(zone2_seconds) as z2,
  SUM(zone3_seconds) as z3,
  SUM(zone4_seconds) as z4,
  SUM(zone5_seconds) as z5
FROM activity_hr_zones hz
JOIN activities a ON hz.activity_id = a.id
WHERE a.user_id = $1
  AND a.start_date >= CURRENT_DATE - INTERVAL '28 days';
```

## Docker Setup

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:14
    container_name: runcoach-db
    environment:
      POSTGRES_USER: runcoach
      POSTGRES_PASSWORD: password
      POSTGRES_DB: runcoach
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Commands

```bash
# Start database
docker-compose up -d

# Stop database
docker-compose down

# Connect to database
docker exec -it runcoach-db psql -U runcoach -d runcoach

# View logs
docker-compose logs -f db
```

## Backup & Restore

```bash
# Backup
docker exec runcoach-db pg_dump -U runcoach runcoach > backup.sql

# Restore
docker exec -i runcoach-db psql -U runcoach runcoach < backup.sql
```

## Performance Indexes

Critical indexes for query performance:

```sql
-- Activity queries
CREATE INDEX idx_activities_user_date ON activities(user_id, start_date DESC);

-- Workout queries
CREATE INDEX idx_planned_workouts_user_date ON planned_workouts(user_id, scheduled_date);

-- HR zone aggregation
CREATE INDEX idx_activity_hr_zones_user ON activity_hr_zones(user_id);

-- Conversation lookup
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```
