# How to Start RunCoach Services

This guide shows the correct order to start all services for local development.

## Prerequisites

- PostgreSQL running on port 5438
- Node.js installed
- Dependencies installed (`npm install` in both backend and agent-service)

## Option 1: One-Time Setup (First Time Only)

Before starting services for the first time, initialize the checkpoint tables:

```bash
cd agent-service
npx ts-node src/scripts/setup-checkpoints.ts
```

This creates the required LangGraph checkpoint tables. You only need to do this once (or if you drop/recreate the database).

## Option 2: Start Services (Every Time)

### Terminal 1: Backend
```bash
cd backend
npm run dev
```

Wait for: `✓ Migrations completed successfully` and `Server listening on port 3001`

### Terminal 2: Agent Service
```bash
cd agent-service
npm run dev
```

Wait for: `✓ PostgreSQL checkpoint saver initialized` and `Ready to receive chat requests! 🎯`

### Terminal 3: Frontend
```bash
cd frontend
npm run dev
```

Wait for: `Local: http://localhost:5173`

## Verifying Everything Works

1. Backend health: http://localhost:3001/health
2. Agent service health: http://localhost:3002/health
3. Frontend: http://localhost:5173

## Troubleshooting

### "relation public.checkpoints does not exist"

**Cause**: Checkpoint tables weren't created before agent service started.

**Fix**:
```bash
cd agent-service
npx ts-node src/scripts/setup-checkpoints.ts
# Then restart agent service
```

### Backend migrations fail

**Cause**: Database not running or wrong port.

**Fix**:
- Check PostgreSQL is running: `netstat -ano | findstr :5438`
- Verify DATABASE_URL in `backend/.env` matches your setup

### Agent service can't connect to backend

**Cause**: Backend not started or wrong URL.

**Fix**:
- Start backend first (Terminal 1)
- Check `BACKEND_API_URL=http://localhost:3001` in `agent-service/.env`

## Service Ports

- **PostgreSQL**: 5438
- **Backend API**: 3001
- **Agent Service**: 3002
- **Frontend**: 5173

## Environment Files

Make sure these are configured:

- `backend/.env` - Database URL, JWT secret, Strava keys, OpenAI key
- `agent-service/.env` - Database URL, OpenAI key, backend URL
- `frontend/.env` - Backend API URL, Strava client ID

## Quick Reference

### Kill all services (Windows)
```powershell
# Find processes
netstat -ano | findstr "3001 3002 5173"

# Kill by PID
taskkill /F /PID <pid>
```

### Restart just agent service
```bash
# Kill agent service
# Find PID: netstat -ano | findstr :3002
# taskkill /F /PID <pid>

# Restart
cd agent-service
npm run dev
```

## Development Workflow

1. **First time setup**: Run checkpoint setup script once
2. **Daily development**: Start services in order (Backend → Agent → Frontend)
3. **After database changes**: Restart backend (migrations run automatically)
4. **After agent code changes**: Just save (ts-node-dev auto-reloads)
5. **After frontend code changes**: Vite auto-reloads

## Common Development Tasks

### Add a new migration
1. Create `backend/migrations/XXX_description.sql`
2. Restart backend (migrations run on startup)

### Test pending actions
1. Chat with agent
2. Ask to modify a workout
3. Check for ActionConfirmationCard in UI
4. Approve/reject the change

### View checkpoint state
```bash
cd agent-service
npx ts-node -e "import {pool} from './src/config/database'; (async()=>{const r=await pool.query('SELECT COUNT(*) FROM checkpoints'); console.log('Checkpoints:', r.rows[0].count); await pool.end();})()"
```

## Need Help?

- Backend logs: Check Terminal 1
- Agent logs: Check Terminal 2
- Frontend logs: Check Terminal 3 + browser console
- Database: Use pgAdmin or `docker exec` if using Docker
