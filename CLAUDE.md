# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RunCoach is a full-stack AI-powered running coach application that integrates with Strava for activity tracking and uses OpenAI for personalized coaching conversations. The application helps runners track their training, manage goals, follow training plans, and get AI-powered coaching insights.

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Start with hot reload (ts-node-dev)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled code from dist/
npm run migrate      # Manually run migrations (auto-runs on dev/start)
```

### Frontend
```bash
cd frontend
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Database
```bash
docker-compose up -d        # Start PostgreSQL container
docker-compose down         # Stop PostgreSQL container
docker-compose ps           # Check container status
```

## Architecture Overview

### Full-Stack Data Flow

**Strava → Backend → Database → Frontend → AI Coach**

1. **Authentication**: Strava OAuth flow creates users with access/refresh tokens stored in database
2. **Activity Sync**: Backend polls Strava API, stores activities in PostgreSQL with JSONB fields for splits/laps
3. **Training Plans**: CSV/PDF upload parsed into planned_workouts table with date-based scheduling
4. **AI Context**: `contextBuilder.ts` aggregates user profile, goals, activities, and training plan into rich context
5. **Chat Streaming**: OpenAI responses stream via SSE (Server-Sent Events) to frontend

### Backend Architecture

**Key Pattern: Service Layer Separation**
- **Controllers** (`src/controllers/`) - Handle HTTP requests, parameter validation
- **Services** (`src/services/`) - Business logic, external API calls
- **Models** (`src/models/`) - Database queries (direct SQL via `pg`)
- **Utils** (`src/utils/`) - Reusable helpers (contextBuilder, date formatting)

**Critical Services:**
- `chatService.ts` - OpenAI streaming integration, builds conversation context
- `stravaService.ts` - Activity sync, OAuth token refresh
- `trainingPlanService.ts` - CSV/PDF parsing for workout plans
- `activityService.ts` - Activity analysis, HR zone calculations

**Database Pattern:**
- Migrations run automatically on startup (sequentially by filename)
- No ORM - direct SQL queries via `pg.Pool` from `config/database.ts`
- JSONB columns used for: activity splits, intervals, conversation context
- Date filtering critical: `getWorkouts()` controller branches on `days` param:
  - `days > 30` → fetch all workouts (calendar needs completed + pending for weekly totals)
  - `days ≤ 30` → fetch only upcoming incomplete workouts (dashboard "Next 7 Days")

### Frontend Architecture

**Key Pattern: Context-Driven State**
- **AuthContext** - JWT management, Strava OAuth, user state
- **PreferencesContext** - Units (metric/imperial), week start (Sun/Mon), conversion utilities
- **ThemeContext** - Dark mode toggle

**Data Fetching:**
- React Query (`@tanstack/react-query`) for all API calls
- API client in `src/services/api.ts` exports typed functions
- SSE streaming handled manually in chat components (not React Query)

**Critical Components:**
- `WorkoutCalendar.tsx` - Complex calendar with drag-drop, peak/taper weeks, carb-loading indicators
  - Uses `react-big-calendar` with `moment` localizer
  - Weekly totals calculated client-side from workout data
  - Context passed to chat via `sessionStorage` for weekly analysis
- `ActivityDetailPage.tsx` - Per-kilometer splits display, markdown-rendered chat
- `ChatPage.tsx` - Conversation management, smart title generation from first message

**Styling:**
- Tailwind CSS with custom design tokens in `tailwind.config.js`
- Dark mode via CSS classes (`.dark` prefix)
- Prose classes for markdown rendering (`prose-sm dark:prose-invert`)

### AI Coaching System

**Context Building** (`backend/src/utils/contextBuilder.ts`):
Aggregates into `UserContextData` interface:
- Profile data (age, weight, experience)
- Active goal (marathon target time/date)
- Recent activities (last 30 days with stats)
- Training plan (current week + 4-week lookahead)
- HR zone distribution (last 4 weeks)
- Plan adherence (completed vs. planned workouts)

**System Prompt** (`buildSystemPrompt()`):
- Dynamically generated with user context
- Includes goal progress, training load, upcoming workouts
- Tuned for running-specific coaching (pacing, recovery, injury prevention)

**Conversation Titles:**
- Run discussions: `"Run: [Name] - [Date] - [Distance]"` (set on conversation creation)
- Weekly analysis: `"Weekly Analysis - [Start] to [End]"` (generated from context)
- General chats: Smart title from first message content

### Important Behaviors

**Date Handling:**
- Backend uses `CURRENT_DATE` for SQL queries (PostgreSQL function, respects server timezone)
- Frontend uses `date-fns` for formatting, `moment` for calendar week calculations
- Week start preference (Sunday/Monday) affects both calendar display and stats calculations

**Workout Completion Status:**
- `completion_status` column: `'pending'` | `'completed'` | `'skipped'`
- Completed workouts linked to activities via `completed_activity_id` foreign key
- Dashboard filters out completed workouts for "Next 7 Days"
- Calendar shows all workouts for accurate weekly planned totals

**Unit Conversion:**
- All database values stored in metric (meters, seconds, min/km pace)
- PreferencesContext provides `convertDistance()` and `convertPace()` helpers
- Frontend displays respect user's unit preference (metric/imperial)

**Training Plan Features:**
- Peak weeks identification: configurable 1-3 peak weeks highlighted in orange
- Taper period: configured number of weeks before race, highlighted in purple
- Carb-loading indicators: 1-3 days before 20km+ workouts, yellow emoji in calendar
- Drag-and-drop rescheduling: updates `scheduled_date`, prevents moving completed workouts

## Environment Setup

**Critical Environment Variables:**

Backend `.env`:
```
DATABASE_URL=postgresql://runcoach:password@localhost:5432/runcoach
JWT_SECRET=your-secret-key
STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o  # Current model in use
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:3001/api
VITE_STRAVA_CLIENT_ID=your-strava-client-id
```

**First-Time Setup:**
1. Create Strava app at https://www.strava.com/settings/api
2. Set callback domain to `localhost`
3. Update both backend and frontend `.env` files with client ID
4. Start PostgreSQL: `docker-compose up -d`
5. Start backend (auto-runs migrations): `cd backend && npm run dev`
6. Start frontend: `cd frontend && npm run dev`

## Common Issues & Solutions

**Backend won't start - "EADDRINUSE: port 3001":**
- Another process is using port 3001
- Windows: `netstat -ano | findstr :3001` then `taskkill /F /PID <pid>`
- Change PORT in backend/.env if needed

**Weekly planned distance incorrect:**
- Check `getWorkouts()` controller logic for `days` parameter branching
- Calendar needs ALL workouts (completed + pending) from past 60 days
- Dashboard "Next 7 Days" should only show upcoming incomplete workouts

**Markdown not rendering in chat:**
- Ensure `react-markdown` and `remark-gfm` are installed
- Use `prose` classes: `prose prose-sm dark:prose-invert max-w-none`
- Example: `<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>`

**Splits data not showing:**
- Strava API doesn't always include splits (depends on device/activity type)
- Check `activity.splits_metric` exists before rendering table
- Display fallback message if no splits available

## Code Patterns to Follow

**Backend:**
- Controllers validate inputs, call services, handle errors
- Services contain business logic, call models for data
- Models perform raw SQL queries, return typed objects
- Always use parameterized queries: `query('SELECT * FROM table WHERE id = $1', [id])`

**Frontend:**
- Use React Query for server state (`useQuery`, `useMutation`)
- Use Context for client state (auth, preferences, theme)
- Extract reusable components to `src/components/`
- Use Tailwind utilities over custom CSS

**Database:**
- Create new migration files with sequential numbering: `XXX_description.sql`
- Migrations are idempotent (use `IF NOT EXISTS`, `IF EXISTS`)
- Include comments for complex schema changes
- JSONB columns for flexible data (splits, intervals, context snapshots)

**Type Safety:**
- Shared types in `frontend/src/types/index.ts`
- Backend defines types in model files
- Keep interfaces in sync between frontend and backend
- Use `Partial<T>` for update operations

## Testing & Debugging

**Backend Logs:**
- Morgan HTTP logging enabled by default
- Database query logging in `config/database.ts`
- Console logs preserved in git (useful for debugging)

**Frontend Debugging:**
- React Query DevTools not included (add if needed)
- Browser console for API errors
- Network tab for SSE streaming inspection

**Database Inspection:**
```bash
docker exec -it runcoach-db psql -U runcoach -d runcoach
# Then run SQL queries directly
SELECT * FROM users;
SELECT * FROM activities ORDER BY start_date DESC LIMIT 10;
```
