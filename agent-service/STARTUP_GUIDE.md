# Agent Service Startup Guide

## Quick Start (Automated)

The agent service now handles all setup automatically! Just run:

```bash
cd agent-service
npm run dev
```

**That's it!** The service will automatically:
1. ✅ Check database connection
2. ✅ Create checkpoint tables if they don't exist
3. ✅ Verify environment variables
4. ✅ Start the service

---

## What Happens During Startup

### 🔍 Startup Verification (Automatic)

When you run `npm run dev`, the service performs these checks:

#### 1. Database Connection
- Connects to PostgreSQL using `DATABASE_URL` from `.env`
- Verifies the database is reachable
- **If fails**: Shows error with troubleshooting steps

#### 2. Checkpoint Tables
- Checks if LangGraph checkpoint tables exist
- **If missing**: Automatically creates them (no manual setup needed!)
- Required tables:
  - `checkpoints`
  - `checkpoint_writes`
  - `checkpoint_blobs`
  - `checkpoint_migrations`

#### 3. Environment Variables
- Verifies all required variables are set:
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - `BACKEND_API_URL`
  - `SERVICE_SECRET`
- **If missing**: Shows which variables need to be set

---

## Troubleshooting

### Issue: "Database connection failed"

**Solution:**
1. Make sure PostgreSQL is running:
   ```bash
   docker-compose up -d
   ```

2. Check your `.env` file has correct `DATABASE_URL`:
   ```
   DATABASE_URL=postgresql://runcoach:password@localhost:5432/runcoach
   ```

3. Verify port and credentials match your Docker setup

### Issue: "Missing environment variables"

**Solution:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in all required values:
   ```
   DATABASE_URL=postgresql://...
   OPENAI_API_KEY=sk-...
   BACKEND_API_URL=http://localhost:3001/api/v1
   SERVICE_SECRET=your-secret-key
   ```

### Issue: "Checkpoint table creation failed"

**Possible causes:**
- Database user lacks CREATE TABLE permissions
- Database connection interrupted during setup
- PostgreSQL version incompatibility

**Solution:**
1. Check database permissions:
   ```sql
   GRANT CREATE ON SCHEMA public TO runcoach;
   ```

2. Try manual setup:
   ```bash
   npm run setup-checkpoints
   ```

3. If still failing, check PostgreSQL logs for errors

---

## Manual Operations (Optional)

While setup is now automatic, you can still run these commands manually if needed:

### Verify Setup (Without Starting Service)
```bash
npm run verify
```

Checks everything without starting the service. Useful for debugging.

### Manual Checkpoint Setup
```bash
npm run setup-checkpoints
```

Manually create checkpoint tables. Only needed if you want to pre-create them or recreate after deletion.

---

## Environment Configuration

### Required Variables

Create `agent-service/.env` with these values:

```env
# Database (same as backend)
DATABASE_URL=postgresql://runcoach:password@localhost:5432/runcoach

# OpenAI API
OPENAI_API_KEY=sk-your-key-here

# Backend API URL (for fetching user context)
BACKEND_API_URL=http://localhost:3001/api/v1

# Service authentication secret (must match backend)
SERVICE_SECRET=your-secret-key-here

# Optional: Service port (default: 3002)
PORT=3002

# Optional: Node environment
NODE_ENV=development
```

### Optional Variables

```env
# Model configuration (has defaults)
DEFAULT_MODEL=gpt-4o
MINI_MODEL=gpt-4o-mini

# Checkpoint cleanup (default: 90 days)
CHECKPOINT_RETENTION_DAYS=90
```

---

## Development Workflow

### Starting Development
```bash
# From project root
cd agent-service
npm run dev
```

Service starts on `http://localhost:3002` (or your configured PORT)

### Restarting After Changes
The dev server uses `ts-node-dev` which automatically restarts on file changes.

No need to manually restart!

### Checking Logs
All startup checks are logged:
```
🔍 Verifying agent service setup...

1️⃣ Checking database connection...
   ✓ Database connected: 2024-02-10T...

2️⃣ Checking checkpoint tables...
   ℹ️  Checkpoint tables not found - setting up automatically...
   🔧 Creating checkpoint tables...
   ✅ Checkpoint tables created successfully

3️⃣ Checking environment variables...
   ✅ All required environment variables set

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Startup verification complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 Initializing LangGraph agent...
✅ RunCoach Agent Service Running
```

---

## Architecture Notes

### Why Checkpoint Tables?

LangGraph uses PostgreSQL to persist conversation state (checkpoints). This allows:
- Resuming interrupted conversations
- Multi-turn dialogue with memory
- Conversation history across restarts

### Where Are Checkpoints Stored?

Checkpoint tables are created in the **same database** as the main backend (`runcoach` database), just with different table names (`checkpoint*` prefix).

This simplifies deployment - only one database to manage!

### Automatic Cleanup

Checkpoints older than 90 days are automatically cleaned up daily at 2 AM to prevent database bloat.

---

## Migration from Manual Setup

**If you previously ran setup-checkpoints.ts manually**, no action needed! The automated startup will detect existing tables and skip creation.

**If you want a fresh start**:
```sql
-- Connect to database
psql -U runcoach -d runcoach

-- Drop checkpoint tables (CAUTION: Loses conversation history!)
DROP TABLE IF EXISTS checkpoint_migrations CASCADE;
DROP TABLE IF EXISTS checkpoint_blobs CASCADE;
DROP TABLE IF EXISTS checkpoint_writes CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;

-- Next "npm run dev" will recreate them automatically
```

---

## Success Criteria

You know the service is ready when you see:

```
✅ RunCoach Agent Service Running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server: http://localhost:3002
✓ Health: http://localhost:3002/health
✓ Backend API: http://localhost:3001/api/v1
✓ Environment: development
✓ Checkpoint: PostgreSQL (persistent)
✓ Default Model: gpt-4o
✓ Mini Model: gpt-4o-mini
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to receive chat requests! 🎯
```

Test the health endpoint:
```bash
curl http://localhost:3002/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-02-10T..."
}
```

**All good? You're ready to build!** 🚀
