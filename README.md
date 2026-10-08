# RunCoach - AI-Powered Running Coach

An AI-powered running coach application that integrates with Strava to provide personalized training guidance and analysis.

## Features

- **Strava Integration**: OAuth authentication and automatic activity syncing
- **AI Coach**: Chat with an AI running coach that understands your training data and goals
- **Dashboard**: View your recent runs, statistics, and progress
- **Goal Tracking**: Set and track marathon goals
- **Profile Management**: Manage personal data (age, weight, running experience, etc.)

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- PostgreSQL (via Docker)
- Strava API integration
- OpenAI API integration

### Frontend
- React + TypeScript
- Vite
- Tailwind CSS
- React Query
- React Router

## Prerequisites

- Node.js (v18 or later)
- Docker (for PostgreSQL)
- Strava API credentials
- OpenAI API key

## Setup Instructions

### 1. Get Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create a new application
3. Note your **Client ID** and **Client Secret**
4. Set Authorization Callback Domain to: `localhost`

### 2. Update Environment Variables

#### Backend `.env`
Edit `backend/.env` and add your Strava Client ID:
```
STRAVA_CLIENT_ID=your-client-id-here
```

#### Frontend `.env`
Edit `frontend/.env` and add your Strava Client ID:
```
VITE_STRAVA_CLIENT_ID=your-client-id-here
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

This will start PostgreSQL on port 5432. The database will be automatically created with the name `runcoach`.

### 4. Start the Backend

```bash
cd backend
npm run dev
```

The backend will:
- Run database migrations automatically
- Start on http://localhost:3001
- API will be available at http://localhost:3001/api

### 5. Start the Frontend

In a new terminal:

```bash
cd frontend
npm run dev
```

The frontend will start on http://localhost:5173

## Usage

1. Open http://localhost:5173 in your browser
2. Click "Connect with Strava" to authenticate
3. After authentication, you'll be redirected to the dashboard
4. Click "Sync Strava" to import your running activities
5. Go to "Profile" to set up your personal information and marathon goal
6. Go to "Coach" to chat with the AI running coach about your training

## API Endpoints

### Authentication
- `GET /api/auth/strava` - Initiate Strava OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/me` - Get current user

### Activities
- `GET /api/activities` - Get user activities
- `POST /api/activities/sync` - Sync activities from Strava
- `GET /api/activities/stats` - Get aggregate statistics

### Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile

### Goals
- `GET /api/goals` - Get all goals
- `POST /api/goals` - Create a new goal
- `PUT /api/goals/:id` - Update a goal

### Chat
- `GET /api/chat/conversations` - Get all conversations
- `POST /api/chat/conversations` - Create new conversation
- `GET /api/chat/conversations/:id` - Get conversation history
- `POST /api/chat/message` - Send message (SSE streaming response)

## Project Structure

```
RunCoach/
├── backend/
│   ├── src/
│   │   ├── config/         # Database, Strava, OpenAI config
│   │   ├── middleware/     # Auth, error handling
│   │   ├── models/         # Data models
│   │   ├── services/       # Business logic
│   │   ├── controllers/    # Request handlers
│   │   ├── routes/         # API routes
│   │   ├── utils/          # Helpers
│   │   └── index.ts        # Entry point
│   └── migrations/         # SQL migrations
├── frontend/
│   ├── src/
│   │   ├── pages/          # Route pages
│   │   ├── components/     # UI components
│   │   ├── services/       # API clients
│   │   ├── context/        # React context
│   │   └── main.tsx        # Entry point
└── docker-compose.yml      # PostgreSQL container
```

## Database Schema

The application uses 5 main tables:

1. **users** - Strava user info and OAuth tokens
2. **user_profiles** - Personal data (age, weight, etc.)
3. **activities** - Strava run data
4. **goals** - Marathon and training goals
5. **conversations** & **chat_messages** - AI coach conversations

Migrations are run automatically when the backend starts.

## Environment Variables

### Backend
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `STRAVA_CLIENT_ID` - Strava API client ID
- `STRAVA_CLIENT_SECRET` - Strava API client secret
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_MODEL` - OpenAI model to use (default: gpt-4-turbo-preview)

### Frontend
- `VITE_API_URL` - Backend API URL (default: http://localhost:3001/api)
- `VITE_STRAVA_CLIENT_ID` - Strava API client ID

## Troubleshooting

### "Database connection failed"
- Ensure Docker is running
- Check that PostgreSQL is running: `docker-compose ps`
- Verify DATABASE_URL in backend/.env

### "Authentication failed"
- Ensure STRAVA_CLIENT_ID is set in both backend/.env and frontend/.env
- Check that STRAVA_CLIENT_SECRET matches your Strava app
- Verify redirect URI in Strava app settings

### "Activities not syncing"
- Check that you've authorized the correct Strava scopes
- Verify Strava API credentials
- Check backend logs for errors

### "Chat not working"
- Verify OPENAI_API_KEY is set correctly
- Check OpenAI API quota and billing
- Ensure the model name is correct

## Development

### Azure Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Azure resource provisioning, safe database initialization, and live verification, and [GITHUB_SECRETS.md](GITHUB_SECRETS.md) for the `Prod` environment's OIDC configuration. GitHub Actions redeploys all three App Services on reviewed pushes to `main`/`master`; infrastructure must be provisioned first.

### Standalone Strava MCP Deployment

For the lightweight ChatGPT integration, use [mcp-server/README.md](mcp-server/README.md), `infra/mcp.bicep`, and the separate `deploy-mcp.yml` workflow with the `ProdMcp` environment. This deployment reuses the resource group but creates isolated hosting and encrypted credential storage; it does not need the full-stack application or an OpenAI API key. MCP-only changes do not trigger the full-stack deployment workflow.

### Backend Development
```bash
cd backend
npm run dev  # Starts with hot reload
```

### Frontend Development
```bash
cd frontend
npm run dev  # Starts Vite dev server
```

### Building for Production

Backend:
```bash
cd backend
npm run build
npm start
```

Frontend:
```bash
cd frontend
npm run build
# Serve the dist/ folder with a static file server
```

## License

MIT

## Support

For issues or questions, please create an issue in the GitHub repository.
