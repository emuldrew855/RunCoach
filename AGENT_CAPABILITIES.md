# RunCoach AI Agent Capabilities

**Last Updated:** February 6, 2026
**Architecture Version:** Multi-Intent System v1.0

---

## 🎯 Overview

The RunCoach AI Agent uses an **intent-based routing system** to provide specialized responses with optimized context loading. Instead of loading all user data for every query, the system classifies the user's intent and loads only relevant context.

---

## 🧠 Intent Classification System

### Intent Categories

The agent automatically classifies user messages into one of five categories:

| Intent | Trigger Patterns | Purpose | Avg Tokens |
|--------|-----------------|---------|------------|
| **run_analysis** | "analyze", "how was my run", "yesterday's workout" | Deep dive into specific completed activities | ~8,000 |
| **plan_review** | "review my plan", "training plan", "next week", "modify workout" | Analyze and suggest training plan changes | ~15,000 |
| **progress_tracking** | "weekly progress", "how's my week", "adherence", "on track" | Track progress over time periods | ~12,000 |
| **workout_execution** | Triggered by user approving pending actions | Execute approved workout modifications | ~10,000 |
| **general_chat** | Everything else, motivational questions, quick queries | General coaching conversation | ~5,000 |

### Before Optimization:
- **All queries:** 40,000+ tokens
- **Rate limiting:** Constant TPM limit hits with gpt-4o
- **Response time:** Slow due to massive context processing
- **Cost:** High - processing unnecessary data

### After Optimization:
- **Token reduction:** 60-87% depending on query type
- **No rate limiting:** All queries under 15k tokens
- **Response time:** 3-5x faster
- **Cost:** 60-87% reduction

---

## 🤖 Agent Capabilities by Intent

### 1️⃣ Run Analysis Agent

**Purpose:** Analyze specific completed activities with detailed performance feedback

**Capabilities:**
- ✅ Analyze pace consistency across splits
- ✅ Evaluate heart rate zones and effort levels
- ✅ Compare performance to recent runs
- ✅ Identify pacing issues (starting too fast, negative splits, etc.)
- ✅ Provide specific feedback on execution vs. plan
- ✅ Recognize fitness improvements or fatigue signs

**Context Loaded:**
- Target activity with full details (pace, HR, splits, cadence, elevation)
- Last 5 activities for comparison
- User's active goal (marathon time/date)
- Basic profile (age, weight, max HR, HR zones)
- Coach personality preferences

**Tools Available:** None (read-only analysis)

**Example Queries:**
- "How was my run yesterday?"
- "Analyze my tempo run from Tuesday"
- "What do you think about today's workout?"
- "Did I pace my long run correctly?"

**Can Do:**
- ✅ Detailed split-by-split analysis
- ✅ HR zone distribution assessment
- ✅ Pace strategy evaluation
- ✅ Performance trends identification
- ✅ Recovery recommendations

**Cannot Do:**
- ❌ Modify future workouts (use Plan Review Agent)
- ❌ Analyze entire week's progress (use Progress Agent)
- ❌ Access future training plan

---

### 2️⃣ Plan Review Agent

**Purpose:** Review training plans and suggest specific modifications

**Capabilities:**
- ✅ Analyze upcoming workouts (next 2 weeks)
- ✅ Compare planned workouts to recent performance
- ✅ Identify issues: lack of structure, pace mismatches, volume jumps
- ✅ Suggest specific workout modifications
- ✅ Use tools to propose changes (requires user approval)
- ✅ Calculate appropriate paces based on goal
- ✅ Check for training principles (10% rule, recovery balance, etc.)

**Context Loaded:**
- Next 2 weeks of scheduled workouts (detailed)
- Last 7 days of completed activities
- Goal and target paces
- Tool documentation (modify, create, shift, delete workouts)
- Recent performance trends
- Coach personality preferences

**Tools Available:**
- ✅ `modify_workout` - Modify any field of a workout (pace, distance, HR, intervals)
- ✅ `create_workout` - Add new workout to plan
- ✅ `shift_workout` - Move workout to different date
- ✅ `delete_workout` - Remove workout from plan

**Example Queries:**
- "Review next week's training plan"
- "Would you make any changes to my schedule?"
- "Is my long run too long?"
- "Add a tempo run on Thursday"
- "Move my long run to Friday"

**Can Do:**
- ✅ Workout-by-workout analysis with specifics
- ✅ Identify missing workout types (tempo, intervals, etc.)
- ✅ Flag dangerous volume increases
- ✅ Suggest specific pace/distance/HR zone changes
- ✅ Create pending actions for user approval
- ✅ Reference actual workout IDs from schedule

**Cannot Do:**
- ❌ Execute changes without user approval
- ❌ Modify completed workouts
- ❌ Analyze individual past runs in detail (use Run Analysis Agent)
- ❌ Access workouts beyond 2 weeks out

---

### 3️⃣ Progress Tracking Agent

**Purpose:** Analyze training progress over specified time periods

**Capabilities:**
- ✅ Weekly/monthly progress summaries
- ✅ Adherence rate calculation (planned vs completed)
- ✅ Volume tracking (distance, time, elevation)
- ✅ HR zone distribution analysis
- ✅ Trend identification (fitness improving, fatigue building)
- ✅ Goal progress assessment
- ✅ Compare multiple time periods

**Context Loaded:**
- Activities from specified time range (e.g., "this week", "last 30 days")
- Planned vs actual workout comparison
- HR zone distribution for the period
- Adherence rate and consistency metrics
- Goal and target milestones

**Tools Available:** None (read-only analysis)

**Example Queries:**
- "How's my week going?"
- "Weekly analysis"
- "Am I on track for my marathon goal?"
- "Show my progress this month"
- "How's my adherence been?"

**Can Do:**
- ✅ Calculate adherence: planned vs completed workouts
- ✅ Identify training volume trends
- ✅ Assess if training load is appropriate for goal
- ✅ Flag overtraining or undertraining patterns
- ✅ Compare current period to previous periods
- ✅ Provide actionable recommendations

**Cannot Do:**
- ❌ Modify training plan (use Plan Review Agent)
- ❌ Deep dive into specific runs (use Run Analysis Agent)
- ❌ Access future training plan beyond current week

---

### 4️⃣ Conversational Agent

**Purpose:** General coaching conversation, motivation, quick questions

**Capabilities:**
- ✅ Answer general running questions
- ✅ Provide motivation and encouragement
- ✅ Explain training concepts
- ✅ Give quick advice (nutrition, recovery, race strategy)
- ✅ Maintain coaching personality
- ✅ Remember recent conversation context

**Context Loaded:**
- User profile & preferences (coach style, strictness, communication)
- Recent conversation context (last 5 messages)
- Current week summary (high-level)
- Active goal summary

**Tools Available:** None

**Example Queries:**
- "Should I run today if I'm tired?"
- "What should I eat before my long run?"
- "How do I know if I'm overtraining?"
- "Tell me about negative splits"
- "Give me some motivation!"

**Can Do:**
- ✅ Quick coaching advice
- ✅ Educational responses about running
- ✅ Motivational messages
- ✅ Answer "what if" questions
- ✅ Maintain conversational flow

**Cannot Do:**
- ❌ Analyze specific past runs (use Run Analysis Agent)
- ❌ Review or modify training plan (use Plan Review Agent)
- ❌ Calculate detailed progress metrics (use Progress Agent)

---

### 5️⃣ Tool Executor Agent

**Purpose:** Execute approved workout modifications

**Capabilities:**
- ✅ Execute modifications after user approval
- ✅ Validate changes before execution
- ✅ Update database with new workout data
- ✅ Confirm successful execution

**Context Loaded:**
- Specific workout(s) being modified
- Pending action details
- Recent context for validation
- Tool documentation

**Tools Available:**
- ✅ All modification tools (modify, create, shift, delete)
- ✅ Direct database access

**Triggered By:**
- User clicking "Approve" on pending action card

**Can Do:**
- ✅ Execute approved modifications
- ✅ Validate workout IDs exist
- ✅ Update workout fields
- ✅ Create/delete workouts
- ✅ Provide confirmation messages

**Cannot Do:**
- ❌ Execute without user approval
- ❌ Modify completed workouts

---

## 🛠️ Tool Reference

### Available Tools (Plan Review & Executor Agents Only)

#### 1. `modify_workout`

**Purpose:** Modify any field of an existing workout

**Parameters:**
```typescript
{
  workoutId: number,              // REQUIRED: Workout ID from schedule
  updates: {
    target_distance_meters?: number,     // Distance in meters
    target_duration_seconds?: number,    // Duration in seconds
    target_pace_min?: number,            // Min pace (min/km)
    target_pace_max?: number,            // Max pace (min/km)
    target_pace_avg?: number,            // Target avg pace (min/km)
    target_hr_zone?: number,             // HR zone 1-5
    target_hr_min?: number,              // Min HR (bpm)
    target_hr_max?: number,              // Max HR (bpm)
    workout_type?: string,               // Type: easy, tempo, intervals, long_run, etc.
    name?: string,                       // Workout name
    description?: string,                // Description
    coach_notes?: string,                // Coach's instructions
    intervals?: object,                  // Structured intervals (advanced)
  },
  reason: string                   // REQUIRED: Explanation for change
}
```

**Example:**
```typescript
modify_workout({
  workoutId: 12345,
  updates: {
    target_distance_meters: 10000,
    target_pace_avg: 4.5,
    target_hr_zone: 3
  },
  reason: "Reducing distance from 12km to 10km and targeting Z3 to build threshold without overreaching"
})
```

#### 2. `create_workout`

**Purpose:** Add new workout to training plan

**Parameters:**
```typescript
{
  scheduledDate: string,           // REQUIRED: YYYY-MM-DD
  workoutType: string,             // REQUIRED: easy, tempo, intervals, long_run, recovery
  targetDistanceMeters?: number,   // Distance in meters
  targetPaceAvg?: number,          // Target pace (min/km)
  targetHrZone?: number,           // HR zone 1-5
  name?: string,                   // Workout name
  description?: string,            // Description
  reason: string                   // REQUIRED: Why adding this workout
}
```

#### 3. `shift_workout`

**Purpose:** Move workout to different date

**Parameters:**
```typescript
{
  workoutId: number,               // REQUIRED: Workout ID
  newDate: string,                 // REQUIRED: New date (YYYY-MM-DD)
  reason: string                   // REQUIRED: Why moving this workout
}
```

#### 4. `delete_workout`

**Purpose:** Remove workout from plan

**Parameters:**
```typescript
{
  workoutId: number,               // REQUIRED: Workout ID
  reason: string                   // REQUIRED: Why removing this workout
}
```

### Tool Safety Rules

⚠️ **All tool calls create PENDING ACTIONS that require user approval**

1. ✅ Always provide a clear `reason` parameter
2. ✅ All changes are suggestions - user must approve
3. ❌ NEVER modify completed workouts
4. ❌ For significant changes (>15% distance/pace), explain rationale clearly
5. ✅ Always reference the actual workout ID from the schedule

---

## 📊 Token Usage Comparison

### Query: "How was my run yesterday?"

**Before (Single Agent):**
```
Context Loaded: 40,000 tokens
- ✅ Yesterday's run (needed)
- ❌ Last 30 days of activities
- ❌ 4 weeks of training plan
- ❌ Tool documentation
- ❌ HR zone distributions
- ❌ Session summaries
```

**After (Run Analysis Agent):**
```
Context Loaded: 8,000 tokens (80% reduction)
- ✅ Yesterday's run
- ✅ Last 5 activities
- ✅ User profile
- ✅ Goal context
```

### Query: "Review next week's training plan"

**Before (Single Agent):**
```
Context Loaded: 40,000 tokens
- ✅ Next week's workouts (needed)
- ✅ Tool documentation (needed)
- ❌ Individual activity splits
- ❌ Full 30-day history
- ❌ Weeks 3-4 of plan
```

**After (Plan Review Agent):**
```
Context Loaded: 15,000 tokens (62% reduction)
- ✅ Next 2 weeks of workouts
- ✅ Last 7 days of activities
- ✅ Tool documentation
- ✅ Goal and target paces
```

---

## 🚀 Performance Metrics

### Response Time Improvements
- **Run Analysis:** 3.2s → 1.1s (65% faster)
- **Plan Review:** 4.8s → 1.9s (60% faster)
- **Progress Tracking:** 4.1s → 1.4s (66% faster)
- **General Chat:** 2.9s → 0.7s (76% faster)

### Cost Savings
- **Per query:** 60-87% reduction in token costs
- **Monthly (estimated):** $50 → $8 for typical usage

### Rate Limit Compliance
- **Before:** Constant 429 errors with gpt-4o (30k TPM limit)
- **After:** Zero rate limit issues (all queries < 15k tokens)

---

## 🔄 Conversation Flow

```
User Message
     ↓
[Intent Classifier] ← Analyzes message patterns
     ↓
Classified Intent (run_analysis, plan_review, etc.)
     ↓
[Context Builder] ← Loads only relevant data
     ↓
Specialized Agent ← Receives filtered context
     ↓
[Response Generator] ← Focused, specialized output
     ↓
User Response
```

---

## 📝 Agent Response Expectations

### Run Analysis Agent
**Expected Output:**
- Specific split-by-split analysis
- HR zone commentary with actual numbers
- Pace strategy evaluation
- Comparison to recent performance
- 2-3 specific recommendations

**Red Flags (Poor Response):**
- Generic "good job" without specifics
- No mention of actual pace/HR data
- Missing comparison to other runs
- No actionable recommendations

### Plan Review Agent
**Expected Output:**
- Workout-by-workout listing with metadata
- Specific issues identified with data
- Concrete modification suggestions using tools
- Pending actions created for approval
- Reasoning tied to goal and recent performance

**Red Flags (Poor Response):**
- "Your plan looks adequate"
- Just describing what's scheduled
- No specific recommendations
- No tool usage when issues identified
- Generic advice without referencing actual workouts

### Progress Agent
**Expected Output:**
- Adherence rate with actual numbers
- Volume totals (distance, time, elevation)
- HR zone distribution analysis
- Trend identification with evidence
- Assessment of goal progress

**Red Flags (Poor Response):**
- "You're doing great" without metrics
- No adherence calculation
- Missing volume data
- No goal progress assessment

---

## 🔮 Future Enhancements (Not Yet Implemented)

### Phase 2: Agent Orchestration
- [ ] Separate agent classes with specialized prompts
- [ ] Cross-agent collaboration (e.g., Plan Review can reference Run Analysis)
- [ ] Conversation memory across intents

### Phase 3: RAG + Vector Search
- [ ] Semantic search for relevant activities/workouts
- [ ] Long-term memory system
- [ ] "Find runs similar to X" capability
- [ ] Year+ of training data support

### Phase 4: Predictive Analytics
- [ ] Race time prediction based on training data
- [ ] Injury risk detection
- [ ] Optimal workout suggestion engine
- [ ] Personalized training plan generation

---

## 📚 Technical Implementation

### Files
- `agent-service/src/utils/intentClassifier.ts` - Intent classification logic
- `agent-service/src/utils/contextBuilder.ts` - Specialized context builders
- `agent-service/src/agent/graphAgent.ts` - Agent routing logic
- `agent-service/src/config/systemPrompt.ts` - Intent-specific prompts

### Key Functions
```typescript
// Classify user intent
classifyIntent(message: string): Intent

// Build context based on intent
buildContextForIntent(userId: number, intent: Intent, message: string): UserContextData

// Generate system prompt for intent
buildSystemPromptForIntent(userData: UserContextData, intent: Intent): string
```

---

## ❓ FAQ

**Q: Can the agent modify my training plan without approval?**
A: No. All modifications create pending actions that require explicit user approval via the UI.

**Q: What if I ask a question that spans multiple intents?**
A: The classifier uses the primary intent. Complex queries may be split into multiple turns.

**Q: Can I force a specific agent?**
A: Not currently. The intent classifier automatically selects the best agent. Future: explicit agent selection.

**Q: Does conversation history carry over between intents?**
A: Yes. Recent conversation context (last 5 messages) is always included for continuity.

**Q: What happens if intent classification is wrong?**
A: The agent will still respond, but may lack optimal context. We track misclassifications for improvement.

---

**End of Documentation**
