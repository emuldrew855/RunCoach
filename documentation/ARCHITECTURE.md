# RunCoach Architecture Overview

## System Summary

RunCoach is an AI-powered running coach application with three main components:

1. **Backend** (Node.js/Express) - REST API, Strava integration, database access
2. **Frontend** (React/Vite) - Single-page application with Tailwind CSS
3. **Agent Service** (LangGraph) - Multi-agent AI coaching system with specialized agents

## High-Level Data Flow

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   Strava    │ ──── │   Backend   │ ──── │  PostgreSQL  │
│   API       │      │  (Express)  │      │   Database   │
└─────────────┘      └──────┬──────┘      └──────────────┘
                            │
                     ┌──────┴──────┐
                     │             │
              ┌──────┴──────┐ ┌────┴─────┐
              │  Frontend   │ │  Agent   │
              │   (React)   │ │  Service │
              └─────────────┘ └──────────┘
```

## Component Details

### Backend (Port 3001)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with direct SQL (no ORM)
- **Authentication**: JWT tokens + Strava OAuth
- **Key Features**:
  - Activity sync from Strava
  - Training plan management
  - Workout scheduling
  - Daily insight generation
  - Execution scoring

### Frontend (Port 5173)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Query + Context API
- **Key Features**:
  - Interactive workout calendar
  - Activity detail with AI debrief
  - Real-time chat with coach
  - Training metrics dashboard

### Agent Service (Port 3002)
- **Framework**: LangGraph (LangChain)
- **Models**: OpenAI GPT-4o (analysis), GPT-4o-mini (execution)
- **Architecture**: Two-pass system with 4 specialized agents
- **Key Features**:
  - Intent classification
  - Context-aware tool selection
  - Workout modification tools
  - Streaming responses

## Authentication Flow

```
1. User clicks "Connect Strava"
2. Frontend redirects to Strava OAuth
3. Strava redirects back with auth code
4. Backend exchanges code for tokens
5. Backend creates/updates user record
6. Backend issues JWT to frontend
7. Frontend stores JWT in localStorage
8. All API calls include JWT in Authorization header
```

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| users | User accounts with Strava tokens |
| activities | Synced running activities from Strava |
| activity_hr_zones | HR zone distribution per activity |
| planned_workouts | Training plan workouts |
| race_goals | Target races with goal times |
| conversations | Chat conversations |
| messages | Individual chat messages |
| user_profiles | Extended user settings |

## Key Integrations

### Strava API
- OAuth 2.0 authentication
- Activity sync (detailed metrics)
- HR zones and splits data
- Automatic token refresh

### OpenAI API
- GPT-4o for analysis and reasoning
- GPT-4o-mini for tool execution
- Streaming responses via SSE
- Function calling for workout tools

## Environment Configuration

### Backend (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
OPENAI_API_KEY=...
AGENT_SERVICE_URL=http://localhost:3002
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api
VITE_STRAVA_CLIENT_ID=...
```

### Agent Service (.env)
```
OPENAI_API_KEY=...
BACKEND_URL=http://localhost:3001/api
```

## Development Setup

1. Start PostgreSQL: `docker-compose up -d`
2. Start Backend: `cd backend && npm run dev`
3. Start Agent Service: `cd agent-service && npm run dev`
4. Start Frontend: `cd frontend && npm run dev`

## Key Design Patterns

### Service Layer Separation (Backend)
- **Controllers**: HTTP handling, validation
- **Services**: Business logic
- **Models**: Database queries
- **Utils**: Reusable helpers

### Intent-Based Routing (Agent Service)
- Classify user message into intent category
- Load only relevant context for that intent
- Route to specialized agent
- Execute tools based on analysis

### Context-Driven State (Frontend)
- **AuthContext**: JWT, user state
- **PreferencesContext**: Units, week start
- **ThemeContext**: Dark mode

## Performance Optimizations

1. **Token Optimization**: Intent-based context loading reduces API costs
2. **Streaming**: SSE for real-time chat responses
3. **Caching**: React Query caches API responses
4. **Lazy Loading**: Route-based code splitting

## Security Considerations

1. JWT tokens for API authentication
2. Parameterized SQL queries (SQL injection prevention)
3. Input validation on all endpoints
4. Secure token storage (refresh tokens in DB only)
5. CORS configuration for frontend origin
