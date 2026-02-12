# Phase 2 Testing Guide: Behavioral Memory System

This guide provides step-by-step instructions for testing the Phase 2 behavioral memory features.

---

## Prerequisites

1. **Backend running**: `cd backend && npm run dev`
2. **Agent-service running**: `cd agent-service && npm run dev` (if separate)
3. **Database migrations applied**: Migrations 027 and 028 should be applied
4. **Test user with historical data**: User with at least 10 activities over 4+ weeks

---

## Test Suite Overview

### Test 1: Database Schema Verification
### Test 2: Runner Tendency Computation
### Test 3: Context Builder Integration
### Test 4: System Prompt Formatting
### Test 5: Coaching with Tendencies
### Test 6: Coaching Response Recording
### Test 7: Effectiveness Assessment
### Test 8: Scheduled Job Execution

---

## Test 1: Database Schema Verification

**Purpose**: Verify migrations were applied correctly

### Steps:

1. Connect to PostgreSQL:
   ```bash
   docker exec -it runcoach-db psql -U runcoach -d runcoach
   ```

2. Check tables exist:
   ```sql
   \dt runner_tendencies
   \dt coaching_responses
   ```

   **Expected**: Both tables should exist

3. Check runner_tendencies schema:
   ```sql
   \d runner_tendencies
   ```

   **Expected columns**: id, user_id, tendency_type, pacing_behavior, hr_management, volume_behavior, compliance_behavior, observation_start, observation_end, activities_analyzed, confidence_score, created_at, updated_at

4. Check indexes:
   ```sql
   \di runner_tendencies*
   \di coaching_responses*
   ```

### ✅ Pass Criteria:
- Both tables exist with all expected columns
- Indexes created
- UNIQUE constraint on (user_id, tendency_type)

---

## Test 2: Runner Tendency Computation

**Purpose**: Test tendency analysis with real user data

### Manual Trigger via Node REPL

```bash
cd backend
node --loader ts-node/esm
```

```typescript
import { computeRunnerTendencies } from './src/services/runnerTendencyService.js';
await computeRunnerTendencies(1); // Replace with your test user ID
```

### Verify Results

```sql
SELECT user_id, tendency_type, activities_analyzed, confidence_score
FROM runner_tendencies
WHERE user_id = 1;
```

### ✅ Pass Criteria:
- Computation completes without errors
- At least 1 tendency row inserted
- Confidence score between 0 and 1
- JSONB fields populated

---

## Test 3: Context Builder Integration

**Purpose**: Verify tendencies are fetched and included in context

Add temporary logging to `backend/src/utils/contextBuilder.ts`:

```typescript
console.log('🔍 Runner tendencies:', runnerTendencies.length);
```

Trigger a chat message and check logs.

### ✅ Pass Criteria:
- Context builder fetches tendencies without errors
- Tendencies included in UserContextData

---

## Test 4: System Prompt Formatting

**Purpose**: Verify tendencies formatted correctly in prompt

Send test message and check agent-service logs for formatted tendency section:

```
## 🎯 YOUR BEHAVIORAL PATTERNS (4-6 Week Analysis)
**🏃 PACING PATTERNS** (15 runs analyzed, confidence: HIGH):
- ⚠️ **Starts Too Fast**: You fade in 70% of runs...
```

### ✅ Pass Criteria:
- Tendency section appears in system prompt
- Formatting clean and readable
- Coaching instructions included

---

## Test 5: Coaching with Tendencies

**Purpose**: Verify AI coach references patterns

Send message: **"How was my run yesterday?"**

**Expected response should include**:
- Pattern reference: "You've started too fast in X of Y runs"
- Historical comparison
- Specific guidance based on patterns

### ✅ Pass Criteria:
- Coach mentions specific frequencies
- Uses "persistent pattern" or "based on your history"
- Provides personalized guidance

---

## Test 6: Coaching Response Recording

**Purpose**: Verify advice is tracked

Test the service directly:

```typescript
import { recordCoachingAdvice } from './src/services/coachingResponseService.js';
import { v4 as uuidv4 } from 'uuid';

await recordCoachingAdvice(
  1, // userId
  uuidv4(),
  uuidv4(),
  "Start easy runs at 5:15/km",
  "pacing",
  { weeklyVolume: 45 }
);
```

Verify in database:

```sql
SELECT * FROM coaching_responses WHERE user_id = 1 ORDER BY created_at DESC LIMIT 1;
```

### ✅ Pass Criteria:
- Record inserted successfully
- Follow-up date calculated correctly
- Context snapshot stored

---

## Test 7: Effectiveness Assessment

**Purpose**: Test follow-up checking

Create test data with past follow-up date:

```sql
INSERT INTO coaching_responses
  (user_id, coaching_point, coaching_category, follow_up_date)
VALUES (1, 'Test advice', 'pacing', CURRENT_DATE - INTERVAL '1 day');
```

Run check:

```typescript
import { checkFollowUpItems } from './src/services/coachingResponseService.js';
await checkFollowUpItems();
```

Verify assessment results in database.

### ✅ Pass Criteria:
- Follow-up runs without errors
- Effectiveness assessed
- Scores reasonable (1-5 range)

---

## Test 8: Scheduled Job Execution

**Purpose**: Verify cron jobs start correctly

Start backend and check console for:

```
🕐 Scheduling runner tendency analysis job...
📅 Schedule: Bi-weekly (1st & 15th) at 6:00 AM
✅ Runner tendency job scheduled successfully
```

Test manual triggers:

```typescript
import { triggerRunnerTendencyNow } from './src/jobs/runner-tendency.job.js';
await triggerRunnerTendencyNow();
```

### ✅ Pass Criteria:
- All jobs scheduled on startup
- Manual triggers execute successfully
- No errors during execution

---

## Troubleshooting

**Issue**: "Not enough activities"
- **Solution**: Use user with 10+ activities over 4+ weeks

**Issue**: Tendencies not in chat
- **Solution**: Check context builder logs, verify DB query

**Issue**: Jobs not running
- **Solution**: Check timezone, validate cron expression

---

## Success Checklist

- [ ] Database tables exist
- [ ] Tendency computation works
- [ ] Tendencies in context
- [ ] System prompt formatting works
- [ ] Coach references patterns
- [ ] Advice recording works
- [ ] Effectiveness assessment works
- [ ] Cron jobs scheduled

**All checked? Phase 2 ready for production!** 🎉
