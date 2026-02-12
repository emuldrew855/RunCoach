# Phase 2: Separate Agent Configurations - Implementation Plan

**Start Date:** February 6, 2026
**Architecture:** Multi-Agent System with Specialized Configurations

---

## 🎯 Goals

1. **Create specialized agent classes** for each intent type
2. **Tailor system prompts** to each agent's specific role
3. **Configure tool availability** per agent (remove tools from read-only agents)
4. **Improve response quality** through specialization
5. **Further reduce token usage** by removing irrelevant instructions

---

## 🏗️ Architecture Design

### Current (Phase 1):
```
User Query
    ↓
[Intent Classifier]
    ↓
[Single Agent] + Filtered Context + Generic System Prompt
    ↓
Response
```

**Problem:** One agent tries to do everything with generic instructions

### Phase 2:
```
User Query
    ↓
[Intent Classifier]
    ↓
[Agent Router] ← Selects specialized agent
    ↓
Specialized Agent Classes:
  ├─ RunAnalysisAgent (Performance Expert)
  ├─ PlanReviewAgent (Strategic Planner)
  ├─ ProgressAgent (Trend Analyzer)
  └─ ConversationalAgent (Supportive Coach)
    ↓
Tailored System Prompt + Intent-Specific Context + Configured Tools
    ↓
Specialized Response
```

**Benefits:**
- ✅ Each agent has focused expertise
- ✅ No irrelevant instructions cluttering the prompt
- ✅ Tools only available to agents that need them
- ✅ Easier to optimize each agent independently
- ✅ Better response quality through specialization

---

## 📊 Agent Specifications

### 1️⃣ RunAnalysisAgent

**Role:** Performance analysis expert focused on individual completed activities

**Personality:** Analytical, detail-oriented, data-driven

**System Prompt Focus:**
- Split-by-split analysis techniques
- HR zone interpretation
- Pace strategy evaluation
- Comparison methodology
- Recovery recommendations

**Tools Available:** NONE (read-only)

**Context:**
- Target activity (full details)
- Last 5 activities
- User goal
- Profile

**System Prompt Length:** ~5k tokens (reduced from 15k)
- ❌ No tool documentation (saves 4k tokens)
- ❌ No plan modification instructions (saves 3k tokens)
- ❌ No weekly progress guidelines (saves 2k tokens)
- ✅ Only performance analysis instructions

**Example Prompt Structure:**
```
You are a performance analysis expert specializing in running.

YOUR EXPERTISE:
- Analyzing pace consistency and pacing strategy
- Evaluating heart rate zones and effort levels
- Comparing runs to identify fitness trends
- Providing specific, actionable feedback

ANALYSIS FRAMEWORK:
1. Start with overall assessment (distance, time, pace)
2. Dive into splits - identify patterns
3. Evaluate HR zones - proper effort level?
4. Compare to recent runs - improving or fatiguing?
5. Provide 2-3 specific recommendations

[USER CONTEXT - 8k tokens]
[CONVERSATION HISTORY - 2k tokens]

CRITICAL: You cannot modify the training plan. Focus on analysis only.
```

**Total Prompt: ~15k tokens (vs 25k generic)**

---

### 2️⃣ PlanReviewAgent

**Role:** Strategic training plan analyst and modification specialist

**Personality:** Critical, strategic, evidence-based, proactive

**System Prompt Focus:**
- Training plan principles (10% rule, periodization)
- Workout structure evaluation
- Pace calculation for goal times
- Tool usage for modifications
- Safety checks (volume jumps, recovery balance)

**Tools Available:**
- ✅ modify_workout
- ✅ create_workout
- ✅ shift_workout
- ✅ delete_workout
- ✅ bulk_modify_workouts

**Context:**
- Next 2 weeks of workouts
- Last 7 days of activities
- Goal and target paces
- Recent performance trends

**System Prompt Length:** ~12k tokens
- ✅ Full tool documentation (needed)
- ✅ Plan review methodology
- ✅ Modification safety rules
- ❌ No split analysis instructions (saves 2k tokens)
- ❌ No general coaching advice (saves 2k tokens)

**Example Prompt Structure:**
```
You are a strategic training plan analyst and modification specialist.

YOUR ROLE:
- Review training plans with a critical eye
- Identify issues: lack of structure, pace mismatches, volume jumps
- Suggest specific modifications using your tools
- Calculate appropriate paces based on goal performance

ANALYSIS APPROACH:
1. List each workout with full details (day, distance, pace, HR)
2. Identify specific issues with data/reasoning
3. Suggest modifications using tools (always with reasoning)
4. Check for training principles violations

TOOLS AVAILABLE:
[Full tool documentation - 4k tokens]

[USER CONTEXT - 15k tokens]
[CONVERSATION HISTORY - 2k tokens]

CRITICAL RULES:
- Always provide specific recommendations, not generic observations
- Use tools to create pending actions for user approval
- Never modify completed workouts
```

**Total Prompt: ~33k tokens (but worth it for plan modifications)**

---

### 3️⃣ ProgressAgent

**Role:** Training progress and trend analyst

**Personality:** Objective, trend-focused, motivational with data

**System Prompt Focus:**
- Adherence calculation methodology
- Volume trend analysis
- HR zone distribution interpretation
- Goal progress assessment
- Long-term trend identification

**Tools Available:** NONE (read-only)

**Context:**
- Activities from specified time range
- Planned vs actual comparison
- HR zone distribution
- Adherence metrics

**System Prompt Length:** ~6k tokens
- ❌ No tool documentation (saves 4k tokens)
- ❌ No individual run analysis details (saves 2k tokens)
- ❌ No plan modification instructions (saves 3k tokens)
- ✅ Only progress tracking methodology

**Example Prompt Structure:**
```
You are a training progress analyst specializing in trend identification.

YOUR EXPERTISE:
- Calculating adherence (planned vs completed)
- Analyzing volume trends over time
- Interpreting HR zone distributions
- Assessing goal progress and trajectory
- Identifying overtraining or undertraining patterns

ANALYSIS FRAMEWORK:
1. Adherence: planned vs completed (with actual numbers)
2. Volume: total distance, time, elevation (compare to previous periods)
3. HR zones: distribution and what it means for fitness
4. Goal progress: on track? ahead? behind?
5. Trends: improving fitness, fatigue building, etc.

[USER CONTEXT - 12k tokens]
[CONVERSATION HISTORY - 2k tokens]

CRITICAL: Provide data-driven insights with specific numbers and trends.
```

**Total Prompt: ~20k tokens**

---

### 4️⃣ ConversationalAgent

**Role:** Supportive running coach for general questions

**Personality:** Warm, encouraging, educational, accessible

**System Prompt Focus:**
- General running knowledge
- Motivational techniques
- Educational explanations
- Quick advice (nutrition, recovery, race strategy)
- Maintaining coaching personality

**Tools Available:** NONE

**Context:**
- User profile & preferences
- Last 3 activities (high-level)
- Current week summary
- Active goal

**System Prompt Length:** ~4k tokens
- ❌ No tool documentation (saves 4k tokens)
- ❌ No detailed training plan (saves 10k tokens)
- ❌ No complex analysis frameworks (saves 3k tokens)
- ✅ Only general coaching guidelines

**Example Prompt Structure:**
```
You are a supportive running coach for general questions and motivation.

YOUR ROLE:
- Answer general running questions
- Provide motivation and encouragement
- Explain training concepts in accessible language
- Give quick advice on nutrition, recovery, race strategy

COACHING APPROACH:
- Be warm and encouraging
- Use simple, clear explanations
- Provide practical, actionable advice
- Maintain your coaching personality (supportive/analytical/etc)

[USER CONTEXT - 5k tokens]
[CONVERSATION HISTORY - 2k tokens]

CRITICAL: Focus on education and support. For detailed analysis or plan changes, suggest the user ask specific questions.
```

**Total Prompt: ~11k tokens**

---

## 💾 Token Savings Summary

### Phase 1 vs Phase 2

| Agent Type | Phase 1 Prompt | Phase 2 Prompt | Savings |
|------------|---------------|----------------|---------|
| Run Analysis | 15k + 8k ctx = 23k | 5k + 8k ctx = 13k | **43%** |
| Plan Review | 15k + 15k ctx = 30k | 12k + 15k ctx = 27k | **10%** |
| Progress | 15k + 12k ctx = 27k | 6k + 12k ctx = 18k | **33%** |
| General Chat | 15k + 5k ctx = 20k | 4k + 5k ctx = 9k | **55%** |

**Average Additional Savings: 35%**

**Combined with Phase 1:**
- Phase 1 savings: 60-87% (context reduction)
- Phase 2 savings: 10-55% (prompt specialization)
- **Total savings: 70-92% from original 40k**

---

## 🛠️ Implementation Steps

### Step 1: Create Specialized System Prompt Builders

**File:** `agent-service/src/config/specializedPrompts.ts`

```typescript
export function buildRunAnalysisPrompt(userData: UserContextData): string
export function buildPlanReviewPrompt(userData: UserContextData): string
export function buildProgressPrompt(userData: UserContextData): string
export function buildConversationalPrompt(userData: UserContextData): string
```

Each function generates a focused prompt for that agent type.

### Step 2: Create Agent Configuration Interface

**File:** `agent-service/src/agent/agentConfig.ts`

```typescript
interface AgentConfig {
  name: string;
  intent: Intent;
  promptBuilder: (userData: UserContextData) => string;
  tools: Tool[];
  maxTokens: number;
  temperature: number;
}

export const AGENT_CONFIGS: Record<Intent, AgentConfig> = {
  run_analysis: { /* config */ },
  plan_review: { /* config */ },
  progress_tracking: { /* config */ },
  general_chat: { /* config */ },
}
```

### Step 3: Update Agent Router

**File:** `agent-service/src/agent/graphAgent.ts`

Modify `agentNode()` to:
1. Get intent from state
2. Select agent config based on intent
3. Use specialized prompt builder
4. Configure tools based on agent type

```typescript
async function agentNode(state: typeof AgentState.State) {
  const intent = state.intent; // Added to state
  const agentConfig = AGENT_CONFIGS[intent];

  // Use specialized prompt
  const systemPrompt = agentConfig.promptBuilder(state.userContext);

  // Use agent-specific tools
  const model = new ChatOpenAI({
    model: selectModelForChat(message, conversationLength).model,
  }).bindTools(agentConfig.tools);

  // ... rest of logic
}
```

### Step 4: Add Intent to Agent State

**File:** `agent-service/src/agent/graphAgent.ts`

```typescript
const AgentState = Annotation.Root({
  // ... existing fields
  intent: Annotation<Intent>, // NEW: Track which agent type to use
});
```

### Step 5: Update Context Builder to Set Intent

**File:** `agent-service/src/agent/graphAgent.ts`

```typescript
async function buildContextNode(state: typeof AgentState.State) {
  // ... existing intent classification

  return {
    userContext,
    messages: [systemMessage, ...historyMessages],
    stepCount: state.stepCount + 1,
    intent: intentResult.intent, // NEW: Store intent in state
  };
}
```

### Step 6: Implement Conversation Continuity

**Strategy:** Store last intent in conversation metadata

```typescript
// When conversation starts, store intent
conversationMetadata = {
  lastIntent: 'plan_review',
  lastIntentTimestamp: Date.now(),
  intentHistory: ['general_chat', 'run_analysis', 'plan_review']
}

// Use for context in follow-up questions
// "Can you also check next Tuesday?" → uses lastIntent context
```

### Step 7: Create Agent Registry

**File:** `agent-service/src/agent/agentRegistry.ts`

```typescript
export class AgentRegistry {
  private agents: Map<Intent, AgentConfig>;

  getAgent(intent: Intent): AgentConfig {
    return this.agents.get(intent) || this.agents.get('general_chat');
  }

  logAgentSelection(intent: Intent, confidence: number) {
    console.log(`🤖 Selected agent: ${intent} (${confidence}% confidence)`);
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests

1. **Prompt Builder Tests**
   - Each specialized prompt builder generates valid prompts
   - Correct instructions included/excluded
   - Token counts are within expected ranges

2. **Agent Config Tests**
   - Tools correctly assigned per agent
   - Temperature/max tokens appropriate
   - All intents have configs

3. **Router Tests**
   - Correct agent selected for each intent
   - Fallback to general_chat works
   - State properly maintained

### Integration Tests

1. **End-to-End Query Tests**
   ```
   Query: "How was my run yesterday?"
   Expected: RunAnalysisAgent selected
   Expected: No tool documentation in prompt
   Expected: Detailed split analysis
   ```

2. **Tool Availability Tests**
   ```
   Query: "Review my plan"
   Expected: PlanReviewAgent selected
   Expected: Tools available
   Expected: Can create pending actions

   Query: "How was my run?"
   Expected: RunAnalysisAgent selected
   Expected: No tools available
   Expected: Cannot create pending actions
   ```

3. **Conversation Continuity Tests**
   ```
   Turn 1: "Review my plan" → PlanReviewAgent
   Turn 2: "What about Tuesday?" → Should use plan context
   Turn 3: "How was yesterday's run?" → Switch to RunAnalysisAgent
   Turn 4: "What about my splits?" → Continue with RunAnalysisAgent
   ```

---

## 📈 Expected Improvements

### Response Quality

**Before (Phase 1):**
- Single agent with generic instructions
- All tool documentation always present
- Generic analysis patterns for all query types

**After (Phase 2):**
- Specialized agents with focused expertise
- Tools only where needed
- Expert-level responses in each domain

### Example Improvements

**Run Analysis:**
```
Phase 1: "Your run was good. Pace was consistent. HR looked appropriate."
Phase 2: "Excellent negative split execution - you started at 5:20/km and finished at 5:05/km, showing proper pacing discipline. Your HR progression from 135 to 148 bpm indicates good aerobic efficiency. Splits 4-5 were your fastest (5:02, 5:05/km), demonstrating strong finish. Recommendation: Maintain this pacing strategy for future tempo runs."
```

**Plan Review:**
```
Phase 1: "Your plan looks adequate for marathon preparation."
Phase 2: "I've analyzed each workout for next week. Issue 1: Tuesday's Easy/Sprints lacks structure - no pace guidance (currently just '8km'). I recommend converting it to structured intervals: 6x800m at 4:10/km with 90s recovery. Issue 2: Friday's 19.2km long run is a 60% jump from last week's 12km - that violates the 10% rule. I'm suggesting a reduction to 15km. Let me create these modifications for your approval."
```

---

## 🚀 Rollout Plan

### Phase 2a: Foundation (Week 1)
- [ ] Create specialized prompt builders
- [ ] Implement agent configs
- [ ] Add intent to state
- [ ] Basic router logic

### Phase 2b: Integration (Week 1)
- [ ] Update context builder
- [ ] Wire up agent selection
- [ ] Test each agent type
- [ ] Fix any issues

### Phase 2c: Enhancement (Week 2)
- [ ] Implement conversation continuity
- [ ] Add agent registry
- [ ] Enhanced logging
- [ ] Performance monitoring

### Phase 2d: Validation (Week 2)
- [ ] Full integration testing
- [ ] User acceptance testing
- [ ] Performance benchmarking
- [ ] Documentation updates

---

## 📊 Success Metrics

1. **Token Reduction:** Additional 10-55% on top of Phase 1
2. **Response Quality:** Measurable improvement in specificity and actionability
3. **Tool Usage:** Only PlanReviewAgent creates pending actions
4. **User Satisfaction:** "Smarter" responses, more helpful
5. **Maintainability:** Easier to improve individual agents

---

## 🔄 Migration Strategy

**Backward Compatibility:** ✅ Maintained

- Phase 1 code remains functional as fallback
- Phase 2 can be enabled/disabled via feature flag
- Gradual rollout possible

```typescript
const USE_SPECIALIZED_AGENTS = process.env.USE_PHASE2_AGENTS === 'true';

if (USE_SPECIALIZED_AGENTS) {
  // Use Phase 2 specialized agents
} else {
  // Use Phase 1 filtered context with generic agent
}
```

---

## 📝 Next Steps

1. **Review and approve this plan**
2. **Implement Phase 2a (foundation)**
3. **Test with real queries**
4. **Iterate based on results**
5. **Full deployment**

---

**Ready to build Phase 2? Let's create specialized agents that excel in their domains!** 🚀
