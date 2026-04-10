# Backend Documentation

## Overview

The backend is a Node.js/Express application with TypeScript that provides REST APIs for the RunCoach application.

**Location**: `backend/`
**Port**: 3001
**Entry Point**: `src/index.ts`

## Directory Structure

```
backend/src/
├── config/           # Database and app configuration
├── controllers/      # HTTP request handlers
├── middleware/       # Auth, error handling
├── models/           # Database queries
├── routes/           # API route definitions
├── services/         # Business logic
├── types/            # TypeScript interfaces
└── utils/            # Helper functions
```

## Services (22 total)

### Core Services

#### activityService.ts
Handles Strava activity data processing.
- `getActivitiesFromStrava()` - Fetch activities from Strava API
- `syncActivities()` - Sync new activities to database
- `getActivityDetails()` - Get detailed activity with splits/laps
- `calculateHRZones()` - Compute HR zone distribution
- `linkActivityToWorkout()` - Match activity to planned workout

#### chatService.ts
Manages AI coaching conversations.
- `createConversation()` - Start new conversation
- `streamChatResponse()` - Stream OpenAI response via SSE
- `buildConversationContext()` - Aggregate context for AI
- `generateTitle()` - Auto-generate conversation title

#### trainingPlanService.ts
Training plan import and management.
- `parseCSV()` - Parse CSV training plan
- `parsePDF()` - Extract workouts from PDF
- `createPlan()` - Create new training plan
- `assignWorkouts()` - Schedule workouts to dates

#### dailyInsightService.ts
Generates AI-powered daily run analysis.
- `generateDailyInsight()` - Create full insight for activity
- `calculateEffortWithHRZones()` - Compute execution score
- `generateCoachingPoints()` - AI-generated feedback
- `recomputeDailyInsight()` - Refresh insight on demand

#### executionScoringService.ts
Calculates workout execution accuracy.
- `calculateExecutionScore()` - Weighted score (0-100)
  - Pace compliance: 40%
  - Distance compliance: 30%
  - HR zone compliance: 20%
  - Consistency: 10%
- `getExecutionVerdict()` - Textual rating

#### stravaService.ts
Strava API integration.
- `getAuthUrl()` - Generate OAuth URL
- `exchangeToken()` - Exchange code for tokens
- `refreshAccessToken()` - Refresh expired tokens
- `getActivities()` - Fetch user activities
- `getActivity()` - Fetch single activity details

#### workoutService.ts
Planned workout management.
- `getWorkouts()` - Fetch workouts by date range
- `createWorkout()` - Add new planned workout
- `updateWorkout()` - Modify workout details
- `shiftWorkout()` - Move workout to new date
- `deleteWorkout()` - Remove workout
- `bulkModifyWorkouts()` - Batch modifications

#### alertService.ts
Training alerts and notifications.
- `checkTrainingAlerts()` - Evaluate alert conditions
- `getActiveAlerts()` - Get current alerts
- `dismissAlert()` - Mark alert as dismissed

#### goalService.ts
Race goal management.
- `createGoal()` - Set new race goal
- `getActiveGoal()` - Get current goal
- `updateGoal()` - Modify goal details
- `calculateProgress()` - Track progress to goal

#### activityPatternService.ts
Analyzes running patterns over time.
- `getWeeklyPattern()` - Weekly volume trends
- `getMonthlyTrends()` - Monthly statistics
- `identifyPeakWeeks()` - Find high-volume weeks
- `calculateConsistency()` - Training consistency score

### Supporting Services

| Service | Purpose |
|---------|---------|
| userService.ts | User CRUD operations |
| authService.ts | JWT token management |
| profileService.ts | User profile settings |
| weeklyAnalysisService.ts | Weekly training summary |
| hrZoneService.ts | HR zone calculations |
| splitService.ts | Pace split analysis |

## API Endpoints (50+)

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /strava | Get Strava OAuth URL |
| GET | /strava/callback | Handle OAuth callback |
| POST | /refresh | Refresh JWT token |
| GET | /me | Get current user |

### Activity Routes (`/api/activities`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List user activities |
| GET | /:id | Get activity details |
| POST | /sync | Sync from Strava |
| GET | /:id/splits | Get pace splits |
| GET | /:id/hr-zones | Get HR distribution |
| GET | /:id/insights | Get AI insights |
| POST | /:id/recompute-insights | Refresh insights |

### Workout Routes (`/api/workouts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List planned workouts |
| POST | / | Create workout |
| PUT | /:id | Update workout |
| DELETE | /:id | Delete workout |
| POST | /:id/shift | Move to new date |
| POST | /bulk-modify | Batch modifications |
| POST | /:id/complete | Mark as completed |

### Training Plan Routes (`/api/training-plans`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List user's plans |
| POST | / | Create new plan |
| POST | /import/csv | Import from CSV |
| POST | /import/pdf | Import from PDF |
| PUT | /:id | Update plan |
| DELETE | /:id | Delete plan |

### Goal Routes (`/api/goals`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | List race goals |
| GET | /active | Get active goal |
| POST | / | Create goal |
| PUT | /:id | Update goal |
| DELETE | /:id | Delete goal |

### Chat Routes (`/api/chat`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /conversations | List conversations |
| POST | /conversations | Create conversation |
| GET | /conversations/:id | Get conversation |
| DELETE | /conversations/:id | Delete conversation |
| POST | /conversations/:id/messages | Send message (SSE) |

### Coaching Routes (`/api/coaching`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /daily-insight | Get today's insight |
| GET | /weekly-summary | Weekly training summary |
| GET | /alerts | Get active alerts |
| POST | /alerts/:id/dismiss | Dismiss alert |

### Agent Routes (`/api/agent`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /context | Get context for intent |
| POST | /actions/shift-workout | Shift workout date |
| POST | /actions/modify-workout | Modify workout |
| POST | /actions/delete-workout | Delete workout |
| POST | /actions/create-workout | Create workout |
| POST | /actions/bulk-modify | Bulk modifications |
| POST | /actions/swap-weeks | Swap training weeks |

### Profile Routes (`/api/profile`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Get user profile |
| PUT | / | Update profile |
| GET | /hr-zones | Get custom HR zones |
| PUT | /hr-zones | Update HR zones |
| GET | /preferences | Get preferences |
| PUT | /preferences | Update preferences |

## Models (12 total)

### User.ts
```typescript
interface User {
  id: number;
  strava_athlete_id: string;
  email: string;
  first_name: string;
  last_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
}
```

### Activity.ts
```typescript
interface Activity {
  id: number;
  user_id: number;
  strava_id: string;
  name: string;
  type: string;
  distance: number;          // meters
  moving_time: number;       // seconds
  elapsed_time: number;
  average_speed: number;     // m/s
  max_speed: number;
  average_heartrate: number;
  max_heartrate: number;
  start_date: Date;
  splits_metric: JSON;       // per-km splits
  laps: JSON;                // lap data
}
```

### PlannedWorkout.ts
```typescript
interface PlannedWorkout {
  id: number;
  user_id: number;
  training_plan_id: number;
  scheduled_date: Date;
  workout_type: string;      // easy, tempo, interval, long, rest
  target_distance: number;
  target_duration: number;
  target_pace_min: number;
  target_pace_max: number;
  target_hr_zone: number;
  description: string;
  completion_status: 'pending' | 'completed' | 'skipped';
  completed_activity_id: number;
}
```

### RaceGoal.ts
```typescript
interface RaceGoal {
  id: number;
  user_id: number;
  race_name: string;
  race_date: Date;
  race_distance: number;
  target_time: number;       // seconds
  is_active: boolean;
}
```

## Context Builder (`utils/contextBuilder.ts`)

Aggregates user data into `UserContextData` for AI:

```typescript
interface UserContextData {
  profile: {
    name: string;
    age: number;
    weight: number;
    experience: string;
    coachStyle: string;
  };
  goal: {
    raceName: string;
    raceDate: Date;
    targetTime: string;
    daysUntilRace: number;
  };
  recentActivities: Activity[];
  upcomingWorkouts: PlannedWorkout[];
  weeklyStats: {
    volumeCompleted: number;
    volumePlanned: number;
    adherenceRate: number;
  };
  hrZoneDistribution: {
    zone1: number;
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  };
}
```

## Intent Context Builder (`utils/intentContextBuilder.ts`)

Builds intent-specific context to optimize token usage:

| Intent | Context Loaded |
|--------|---------------|
| run_analysis | Recent activity, HR zones, splits |
| plan_review | Next 4 weeks workouts, goal, training phase |
| progress_tracking | Last 4 weeks activities, adherence stats |
| general_chat | Minimal profile, current goal |

## Key Middleware

### authMiddleware.ts
- Validates JWT token from Authorization header
- Attaches `req.user` with user ID
- Returns 401 if token invalid/expired

### errorMiddleware.ts
- Global error handler
- Formats error responses
- Logs errors to console

## Database Patterns

### Direct SQL Queries
```typescript
// Example from Activity model
const result = await pool.query(
  `SELECT * FROM activities
   WHERE user_id = $1
   AND start_date >= $2
   ORDER BY start_date DESC`,
  [userId, startDate]
);
```

### JSONB Columns
Used for flexible data like splits and intervals:
```sql
splits_metric JSONB,
laps JSONB,
intervals JSONB
```

### Migration Pattern
Files in `migrations/` run sequentially on startup:
```
001_initial_schema.sql
002_add_activities.sql
...
030_add_last_activity_sync.sql
```

## Error Handling

Standard error response format:
```json
{
  "error": "Error message",
  "details": "Additional context"
}
```

HTTP status codes:
- 400: Bad request / validation error
- 401: Unauthorized
- 404: Resource not found
- 500: Server error

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3001) |
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Secret for JWT signing |
| STRAVA_CLIENT_ID | Strava OAuth client ID |
| STRAVA_CLIENT_SECRET | Strava OAuth client secret |
| OPENAI_API_KEY | OpenAI API key |
| AGENT_SERVICE_URL | Agent service URL |

## Commands

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Run production build
npm run migrate  # Run database migrations
```
