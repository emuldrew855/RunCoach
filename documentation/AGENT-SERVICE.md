# Agent Service Documentation

## Overview

The agent service is an AI coaching system built with LangGraph (LangChain) that provides intelligent, context-aware coaching responses.

**Location**: `agent-service/`
**Port**: 3002
**Entry Point**: `src/index.ts`

## Architecture

### Two-Pass System

The agent uses a two-pass architecture for optimal results:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Pass 1:       │ ──── │   Pass 2:       │ ──── │   Tool          │
│   Analysis      │      │   Execution     │      │   Execution     │
│   (GPT-4o)      │      │   (GPT-4o)      │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

**Pass 1 (Analysis)**:
- Reads user context and message
- Analyzes situation thoroughly
- Decides what actions are needed
- Outputs structured reasoning

**Pass 2 (Execution)**:
- Reads Pass 1 analysis
- Executes tool calls based on analysis
- No new reasoning, just execution
- Tools bound with appropriate choice mode

## Directory Structure

```
agent-service/src/
├── agent/
│   ├── nodes/           # LangGraph nodes
│   │   ├── analysisNode.ts
│   │   ├── executionNode.ts
│   │   ├── responseNode.ts
│   │   └── toolExecutionNode.ts
│   ├── tools/           # Tool definitions
│   │   └── workoutTools.ts
│   ├── workflow/        # Graph definitions
│   │   └── agentGraph.ts
│   ├── agentConfig.ts   # Agent configurations
│   └── graphAgent.ts    # Main graph setup
├── config/
│   ├── modelSelection.ts
│   ├── specializedPrompts.ts
│   └── systemPrompt.ts
├── types/
│   └── index.ts
├── utils/
│   └── intentClassifier.ts
└── index.ts
```

## Intent Classification

### Intent Types

| Intent | Description | Context Loaded |
|--------|-------------|----------------|
| run_analysis | Analyze specific activity | Activity details, HR data, splits |
| plan_review | Review/modify training plan | Next 4 weeks, goal, training phase |
| progress_tracking | Track progress over time | Last 4 weeks activities, stats |
| general_chat | General questions | Minimal profile, goal |

### Classification Logic (`utils/intentClassifier.ts`)

```typescript
// Scoring system:
// - Keyword match: +1 point
// - Phrase match: +3 points
// - Exclusion match: Skip intent

// Example patterns for plan_review:
keywords: ['plan', 'schedule', 'modify', 'change', 'upcoming']
phrases: [
  /review.*plan/i,
  /modify.*workout/i,
  /planned.*training.*week/i,
  /don't.*focus.*(completed|done)/i  // Negative context handling
]
exclusions: [/how's.*week going/i]  // Routes to progress_tracking instead
```

### Intent Routing

```
User Message
     │
     ▼
┌─────────────────┐
│ Classify Intent │
└────────┬────────┘
         │
    ┌────┴────┬────────────┬────────────┐
    ▼         ▼            ▼            ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌──────────┐
│ Run   │ │ Plan  │ │ Progress │ │ General  │
│Analysis│ │Review │ │ Tracking │ │  Chat   │
└───────┘ └───────┘ └──────────┘ └──────────┘
```

## Specialized Agents

### Run Analysis Agent
**Purpose**: Analyze completed activities
**Tools**: None (analysis only)
**Context**: Activity details, HR zones, splits, target workout

### Plan Review Agent
**Purpose**: Review and modify training plans
**Tools**: All workout tools (shift, modify, create, delete, bulk, swap)
**Context**: 4-week lookahead, goal, current phase, training load

### Progress Tracking Agent
**Purpose**: Track training progress over time
**Tools**: None (analysis only)
**Context**: 4-week history, volume stats, adherence rates

### General Chat Agent
**Purpose**: Handle general coaching questions
**Tools**: None
**Context**: Profile, goal basics

## Tools (7 total)

### shiftWorkout
Move a workout to a different date.
```typescript
{
  name: 'shift_workout',
  parameters: {
    workout_id: number,
    new_date: string,    // YYYY-MM-DD
    reason: string
  }
}
```

### modifyWorkout
Modify workout parameters.
```typescript
{
  name: 'modify_workout',
  parameters: {
    workout_id: number,
    target_distance?: number,
    target_pace_min?: number,
    target_pace_max?: number,
    target_hr_zone?: number,
    description?: string,
    reason: string
  }
}
```

### createWorkout
Add a new planned workout.
```typescript
{
  name: 'create_workout',
  parameters: {
    scheduled_date: string,
    workout_type: string,
    target_distance: number,
    target_pace_min?: number,
    target_pace_max?: number,
    target_hr_zone?: number,
    description?: string,
    reason: string
  }
}
```

### deleteWorkout
Remove a planned workout.
```typescript
{
  name: 'delete_workout',
  parameters: {
    workout_id: number,
    reason: string
  }
}
```

### bulkModifyWorkouts
Modify multiple workouts at once.
```typescript
{
  name: 'bulk_modify_workouts',
  parameters: {
    modifications: Array<{
      workout_id: number,
      changes: WorkoutChanges
    }>,
    reason: string
  }
}
```

### swapTrainingWeeks
Swap two training weeks.
```typescript
{
  name: 'swap_training_weeks',
  parameters: {
    week1_start: string,
    week2_start: string,
    reason: string
  }
}
```

### approvePlan
Approve current plan as-is.
```typescript
{
  name: 'approve_plan',
  parameters: {
    reasoning: string
  }
}
```

## Node Implementations

### Analysis Node (`nodes/analysisNode.ts`)
- Receives user message and context
- Uses specialized prompt for intent
- Outputs structured analysis
- Stores result in state.analysisResult

### Execution Node (`nodes/executionNode.ts`)
- Reads analysis from Pass 1
- Determines if changes needed
- Binds tools with appropriate choice mode:
  - `tool_choice: "required"` if changes needed
  - `tool_choice: "auto"` if plan is sound
- Executes tool calls

### Tool Execution Node (`nodes/toolExecutionNode.ts`)
- Receives tool calls from execution node
- Calls backend API for each tool
- Returns tool results

### Response Node (`nodes/responseNode.ts`)
- Generates final user-facing response
- Incorporates tool results
- Uses coach personality for tone

## LangGraph Workflow

```typescript
const workflow = new StateGraph({
  channels: {
    messages: { value: [] },
    intent: { value: null },
    userContext: { value: null },
    analysisResult: { value: null },
    toolResults: { value: [] },
    modelUsed: { value: null },
    stepCount: { value: 0 },
  },
})
  .addNode('classify', classifyNode)
  .addNode('loadContext', loadContextNode)
  .addNode('analysis', analysisNode)
  .addNode('execution', executionNode)
  .addNode('toolExecution', toolExecutionNode)
  .addNode('response', responseNode)
  .addEdge('classify', 'loadContext')
  .addEdge('loadContext', 'analysis')
  .addConditionalEdge('analysis', shouldExecute)
  .addEdge('execution', 'toolExecution')
  .addEdge('toolExecution', 'response')
  .addEdge('END', 'response');
```

## Prompts

### System Prompts (`config/systemPrompt.ts`)

Base prompt structure:
```
You are an elite running coach with deep expertise in...

ATHLETE PROFILE:
- Name: {name}
- Age: {age}
- Experience: {experience}
- Coach Style: {coachStyle}

CURRENT GOAL:
- Race: {raceName}
- Date: {raceDate}
- Target: {targetTime}
- Days Remaining: {daysUntilRace}

{intent-specific-context}

COACHING GUIDELINES:
- Be direct and specific
- Use data to support recommendations
- Consider recovery and injury prevention
- Adjust tone to match coach style
```

### Specialized Prompts (`config/specializedPrompts.ts`)

#### Analysis Pass Prompt
```
Analyze the athlete's situation and determine what actions are needed.

Consider:
1. Current training load and fatigue
2. Upcoming key workouts
3. Goal timeline and progress
4. Recent execution quality

Output your analysis in a structured format...
```

#### Execution Pass Prompt
```
Based on the analysis above, execute the recommended modifications.

Analysis: {analysisResult}

Use the available tools to implement the changes.
Do not add new reasoning - just execute.
```

## Model Selection (`config/modelSelection.ts`)

| Node | Model | Reasoning |
|------|-------|-----------|
| Analysis | GPT-4o | Complex reasoning needed |
| Execution | GPT-4o | Reliable tool calling |
| Response | GPT-4o-mini | Simple generation |

## Tool Choice Logic

The execution node determines tool choice mode based on analysis content:

```typescript
// Check if analysis recommends changes
const indicatesNoChanges = (
  /plan.*(is |looks )?(sound|good|solid)/i.test(analysisResult) ||
  /no (changes|modifications) (needed|required)/i.test(analysisResult)
);

const indicatesChangesNeeded = (
  /recommend.*(modify|change|delete|shift)/i.test(analysisResult) ||
  /(delete|remove|shift|modify).*(workout|run)/i.test(analysisResult)
);

// Set tool choice
const shouldForceToolCall = indicatesChangesNeeded || !indicatesNoChanges;

const modelWithTools = shouldForceToolCall
  ? model.bindTools(tools, { tool_choice: 'required' })
  : model.bindTools(tools);  // auto
```

## API Endpoints

### POST /api/agent/chat
Main chat endpoint (streaming).

Request:
```json
{
  "message": "Review my training plan for next week",
  "userId": 123,
  "conversationId": 456
}
```

Response (SSE stream):
```
data: {"type": "token", "content": "Based on your..."}
data: {"type": "token", "content": "training load..."}
data: {"type": "tool_call", "name": "shift_workout", "args": {...}}
data: {"type": "tool_result", "result": {...}}
data: {"type": "done"}
```

### GET /api/agent/health
Health check endpoint.

## Error Handling

### Intent Classification Fallback
If classification confidence < 0.5, default to `general_chat`.

### Tool Execution Errors
Tool errors are caught and returned to the model for handling:
```typescript
try {
  const result = await executeToolCall(toolCall);
  return { success: true, result };
} catch (error) {
  return { success: false, error: error.message };
}
```

### Model Errors
Model errors are logged and a fallback response is generated.

## Coach Personalities

Personality affects language tone in all generated content:

### The Scientist (analytical)
- Technical terminology
- Data references
- Objective framing
- Example: "Based on your 4-week rolling average..."

### The Disciplinarian (strict)
- Direct language
- No softening
- Clear accountability
- Example: "You failed to execute the prescribed pace."

### The Encourager (supportive)
- Celebratory language
- Progress emphasis
- Softer corrections
- Example: "Great job getting out there!"

### The Inspirer (motivational)
- Goal-focused
- High energy
- Vision-oriented
- Example: "Every run brings you closer to your goal!"

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3002) |
| OPENAI_API_KEY | OpenAI API key |
| BACKEND_URL | Backend API URL |

## Commands

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Run production build
```

## Debugging

### Intent Classification Test
```typescript
import { testIntentClassifier } from './utils/intentClassifier';
testIntentClassifier();
```

### Verbose Logging
Console logs throughout nodes show:
- Intent classification results
- Context loading
- Analysis output
- Tool calls made
- Response generation

## Common Issues

### Intent Misclassification
- Check exclusion patterns
- Verify keyword/phrase scoring
- Test with `testIntentClassifier()`

### Tool Calls Not Made
- Check `tool_choice` mode
- Verify analysis indicates changes needed
- Check tool binding

### Wrong Context Loaded
- Verify intent classification
- Check `intentContextBuilder.ts`
- Review context for intent type
