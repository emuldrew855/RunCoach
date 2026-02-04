/**
 * Agent Chat Service
 *
 * Enhanced chat service that integrates agentic capabilities with SSE streaming.
 * Handles tool calling, pending action creation, and maintains existing streaming architecture.
 */

import { openai, openaiConfig } from '../config/openai';
import { getMessagesByConversationId, createMessage } from '../models/Chat';
import { buildUserContext, buildSystemPrompt } from '../utils/contextBuilder';
import { tools, requiresApproval, isReadOnly } from '../tools';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { executeAction } from './actionExecutionService';

// Convert Zod schema tools to OpenAI function format
function convertToolsForOpenAI() {
  const toolDefinitions: any[] = [
    {
      type: 'function' as const,
      function: {
        name: 'shift_workout',
        description: 'Move a planned workout to a different date. This is useful when the athlete needs extra recovery time, has a schedule conflict, or when the current workout timing is not optimal. This action requires user approval before execution.',
        parameters: {
          type: 'object',
          properties: {
            workout_id: {
              type: 'integer',
              description: 'ID of the planned workout to shift',
            },
            new_date: {
              type: 'string',
              description: 'New scheduled date in YYYY-MM-DD format',
            },
            reason: {
              type: 'string',
              description: 'Explanation for why this shift is recommended',
            },
          },
          required: ['workout_id', 'new_date', 'reason'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'modify_workout',
        description: 'Modify an existing planned workout by adjusting its intensity, distance, duration, pace, or heart rate zone. This is useful when the athlete shows signs of fatigue, is overtraining, or needs adjustments based on recent performance. This action requires user approval before execution.',
        parameters: {
          type: 'object',
          properties: {
            workout_id: {
              type: 'integer',
              description: 'ID of the planned workout to modify',
            },
            updates: {
              type: 'object',
              properties: {
                target_distance_meters: {
                  type: 'number',
                  description: 'New target distance in meters',
                },
                target_duration_seconds: {
                  type: 'number',
                  description: 'New target duration in seconds',
                },
                target_hr_zone: {
                  type: 'integer',
                  description: 'New target heart rate zone (1-5)',
                  minimum: 1,
                  maximum: 5,
                },
                target_pace_min: {
                  type: 'number',
                  description: 'New minimum target pace in decimal min/km (e.g., 5.5 = 5:30/km)',
                },
                target_pace_max: {
                  type: 'number',
                  description: 'New maximum target pace in decimal min/km',
                },
                target_pace_avg: {
                  type: 'number',
                  description: 'New average target pace in decimal min/km',
                },
                description: {
                  type: 'string',
                  description: 'Updated workout description',
                },
                coach_notes: {
                  type: 'string',
                  description: 'New coach notes for this modification',
                },
              },
            },
            reason: {
              type: 'string',
              description: 'Explanation for this modification',
            },
          },
          required: ['workout_id', 'updates', 'reason'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'create_workout',
        description: 'Add a new workout to the training plan. This is useful when weekly mileage is too low, the athlete needs additional recovery runs, or there are gaps in the training schedule that need to be filled. This action requires user approval before execution.',
        parameters: {
          type: 'object',
          properties: {
            scheduled_date: {
              type: 'string',
              description: 'Date for new workout in YYYY-MM-DD format',
            },
            workout_type: {
              type: 'string',
              enum: ['easy', 'long_run', 'tempo', 'intervals', 'recovery', 'hills', 'race'],
              description: 'Type of workout',
            },
            name: {
              type: 'string',
              description: 'Workout name',
            },
            description: {
              type: 'string',
              description: 'Detailed workout description',
            },
            target_distance_meters: {
              type: 'number',
              description: 'Target distance in meters',
            },
            target_duration_seconds: {
              type: 'number',
              description: 'Target duration in seconds',
            },
            target_hr_zone: {
              type: 'integer',
              description: 'Target heart rate zone (1-5)',
              minimum: 1,
              maximum: 5,
            },
            target_pace_min: {
              type: 'number',
              description: 'Minimum target pace in decimal min/km',
            },
            target_pace_max: {
              type: 'number',
              description: 'Maximum target pace in decimal min/km',
            },
            target_pace_avg: {
              type: 'number',
              description: 'Average target pace in decimal min/km',
            },
            coach_notes: {
              type: 'string',
              description: 'Coach notes for this workout',
            },
            reason: {
              type: 'string',
              description: 'Why this workout is being added',
            },
          },
          required: ['scheduled_date', 'workout_type', 'name', 'reason'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'delete_workout',
        description: 'Remove a planned workout from the training plan. This is useful when the athlete shows signs of overtraining, needs extra recovery time, or when the weekly volume is too high. This action requires user approval before execution.',
        parameters: {
          type: 'object',
          properties: {
            workout_id: {
              type: 'integer',
              description: 'ID of the planned workout to remove',
            },
            reason: {
              type: 'string',
              description: 'Explanation for removing this workout',
            },
          },
          required: ['workout_id', 'reason'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'analyze_performance',
        description: 'Perform deep analysis of the athlete\'s recent training data. This is a read-only operation that provides insights into pacing consistency, heart rate zone distribution, training progression, and recovery patterns. This tool executes immediately without requiring user approval since it only reads data.',
        parameters: {
          type: 'object',
          properties: {
            activity_ids: {
              type: 'array',
              items: {
                type: 'integer',
              },
              description: 'Specific activity IDs to analyze (optional)',
            },
            date_range_days: {
              type: 'integer',
              description: 'Number of days back to analyze (e.g., 7 for last week, 30 for last month)',
            },
            focus_area: {
              type: 'string',
              enum: ['pacing', 'hr_zones', 'progression', 'recovery', 'overall'],
              description: 'Specific area to focus the analysis on',
            },
          },
          required: ['focus_area'],
        },
      },
    },
  ];

  return toolDefinitions;
}

/**
 * Enhanced system prompt with agent capabilities
 */
function buildAgentSystemPrompt(userContext: any): string {
  const basePrompt = buildSystemPrompt(userContext);

  const agentEnhancement = `

# AGENTIC CAPABILITIES

You are not just an advisor - you are an AI agent with the ability to directly modify the training plan when appropriate. You have access to the following tools:

## Available Tools

1. **analyze_performance** (Read-only, executes immediately)
   - Perform deep analysis of recent training data
   - Focus areas: pacing, hr_zones, progression, recovery, overall
   - Use this freely to provide data-driven insights

2. **shift_workout** (Requires user approval)
   - Move a planned workout to a different date
   - Use when: athlete needs recovery, schedule conflicts, or better workout timing
   - Example: "Your tempo run is scheduled for Thursday, but you mentioned being tired. I can shift it to Saturday for better recovery."

3. **modify_workout** (Requires user approval)
   - Adjust workout intensity, distance, pace, or HR zone
   - Use when: athlete shows fatigue, overtraining signs, or needs progression adjustments
   - Example: "Your long run this Sunday is 22km, but based on your recent performance, I can reduce it to 18km to prevent overtraining."

4. **create_workout** (Requires user approval)
   - Add new workout to the training plan
   - Use when: weekly mileage is low, athlete needs recovery run, or gaps in schedule
   - Example: "Your weekly volume is below target. I can add an easy 6km recovery run on Wednesday."

5. **delete_workout** (Requires user approval)
   - Remove a planned workout
   - Use when: athlete needs extra recovery or volume is too high
   - Example: "You've mentioned feeling fatigued. I can remove your easy run tomorrow to prioritize recovery."

## When to Use Tools

**Be Proactive:**
- If you identify an issue (overtraining, insufficient recovery, poor pacing), suggest a concrete change
- Don't just say "consider reducing mileage" - use modify_workout or delete_workout to propose the specific change
- When athlete mentions fatigue or schedule conflicts, offer to shift or modify workouts immediately

**Always Explain:**
- Clearly state why you're suggesting a change
- Reference specific data (HR zones, adherence rate, weekly mileage)
- Explain the benefits and any trade-offs

**User Approval Required:**
- Tools that modify the plan (shift, modify, create, delete) require user approval
- User will see your suggestion with an "Approve" or "Reject" button
- After you call these tools, continue the conversation explaining your rationale

## Example Interactions

**Proactive Suggestion:**
User: "I'm feeling really tired this week"
Agent: "I understand - looking at your data, you've been in Zone 4 for 40% of training (target is <20%). Your tempo run scheduled for Thursday could add more stress. Let me shift it to Saturday and reduce the pace slightly."
*Calls shift_workout and modify_workout tools*
"I've suggested moving your tempo run to Saturday and reducing the intensity. This will give you 3 days of recovery. Please approve if that works for you."

**Data-Driven Adjustment:**
User: "How am I doing this week?"
*Agent calls analyze_performance tool first*
Agent: "Let me analyze your recent training... Based on the data, your pacing has been too aggressive - averaging 4:20/km when Zone 2 should be 5:00-5:30/km. Your long run Sunday is planned for 20km. I recommend reducing the target pace to 5:15/km to build aerobic base."
*Calls modify_workout tool*
"I've suggested adjusting your long run pace. Would you like to approve this change?"

## Important Guidelines

- **Be conversational:** Don't announce "I am calling the analyze_performance tool" - just use it naturally
- **Combine analysis and action:** Use analyze_performance to support your suggestions, then propose changes
- **One change at a time:** Don't overwhelm with multiple modifications at once
- **Respect autonomy:** User always has final say - be supportive if they reject suggestions
- **Context matters:** Consider goal date, injury history, adherence, and upcoming key workouts

Remember: You're an active coach who can make concrete suggestions for changes, not just a passive advisor. Use your tools to help ${userContext.firstName} succeed!`;

  return basePrompt + agentEnhancement;
}

/**
 * Stream chat completion with agent capabilities
 */
export async function streamAgentChatCompletion(
  userId: number,
  conversationId: string,
  userMessage: string
): Promise<{
  stream: AsyncIterable<any>;
  messageId: number;
}> {
  // Build user context
  const userContext = await buildUserContext(userId);
  const systemPrompt = buildAgentSystemPrompt(userContext);

  // Get conversation history
  const history = await getMessagesByConversationId(conversationId, 20);

  // Build messages array
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Save user message and get its ID
  const userMessageRecord = await createMessage({
    user_id: userId,
    conversation_id: conversationId,
    role: 'user',
    content: userMessage,
    context_snapshot: userContext,
    model_used: openaiConfig.model,
  });

  // Convert tools to OpenAI format
  const openaiTools = convertToolsForOpenAI();

  // Stream from OpenAI with tool calling enabled
  const stream = await openai.chat.completions.create({
    model: openaiConfig.model,
    messages,
    stream: true,
    tools: openaiTools as any,
    tool_choice: 'auto',
    max_tokens: openaiConfig.maxTokens,
    temperature: 0.7,
  });

  return {
    stream,
    messageId: userMessageRecord.id,
  };
}

/**
 * Process tool calls and create pending actions
 */
export async function processToolCall(
  toolName: string,
  toolArgs: any,
  userId: number,
  conversationId: string,
  messageId: number
): Promise<{
  requiresApproval: boolean;
  actionId?: string;
  result?: any;
}> {
  // Check if tool requires approval
  if (requiresApproval(toolName)) {
    // Create pending action
    const actionId = uuidv4();

    await query(
      `INSERT INTO pending_actions (
        id, user_id, conversation_id, message_id,
        action_type, action_payload, agent_reasoning, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actionId,
        userId,
        conversationId,
        messageId,
        toolName,
        toolArgs,
        `Agent suggested ${toolName} action`,
        'pending',
      ]
    );

    // Update message with pending action
    await query(
      `UPDATE chat_messages
       SET pending_actions = array_append(pending_actions, $1::uuid)
       WHERE id = $2`,
      [actionId, messageId]
    );

    return {
      requiresApproval: true,
      actionId,
    };
  }

  // Execute read-only tool immediately
  if (isReadOnly(toolName)) {
    const result = await executeReadOnlyTool(toolName, toolArgs, userId);
    return {
      requiresApproval: false,
      result,
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

/**
 * Execute read-only tools
 */
async function executeReadOnlyTool(toolName: string, params: any, userId: number): Promise<any> {
  if (toolName === 'analyze_performance') {
    return await analyzePerformance(params, userId);
  }
  throw new Error(`Unknown read-only tool: ${toolName}`);
}

/**
 * Analyze performance implementation
 */
async function analyzePerformance(
  params: { activity_ids?: number[]; date_range_days?: number; focus_area: string },
  userId: number
): Promise<any> {
  const { activity_ids, date_range_days = 7, focus_area } = params;

  // Fetch activities
  let activities;
  if (activity_ids && activity_ids.length > 0) {
    const result = await query(
      `SELECT * FROM activities
       WHERE user_id = $1 AND id = ANY($2)
       ORDER BY start_date DESC`,
      [userId, activity_ids]
    );
    activities = result.rows;
  } else {
    const result = await query(
      `SELECT * FROM activities
       WHERE user_id = $1
       AND start_date >= CURRENT_DATE - INTERVAL '${date_range_days} days'
       ORDER BY start_date DESC`,
      [userId]
    );
    activities = result.rows;
  }

  if (activities.length === 0) {
    return {
      summary: 'No activities found in the specified time range.',
      activities_analyzed: 0,
    };
  }

  // Simple analysis based on focus area
  const analysis: any = {
    activities_analyzed: activities.length,
    date_range: `Last ${date_range_days} days`,
    focus_area,
  };

  if (focus_area === 'pacing' || focus_area === 'overall') {
    const paces = activities.filter(a => a.average_pace).map(a => a.average_pace);
    if (paces.length > 0) {
      const avgPace = paces.reduce((sum: number, p: number) => sum + p, 0) / paces.length;
      analysis.average_pace_min_km = avgPace.toFixed(2);
      analysis.pace_consistency = Math.max(...paces) - Math.min(...paces) < 1.0 ? 'Good' : 'Variable';
    }
  }

  if (focus_area === 'hr_zones' || focus_area === 'overall') {
    const avgHR = activities
      .filter(a => a.average_hr)
      .reduce((sum: number, a: any) => sum + a.average_hr, 0) / activities.filter(a => a.average_hr).length;
    if (!isNaN(avgHR)) {
      analysis.average_heart_rate = Math.round(avgHR);
    }
  }

  return analysis;
}

export async function saveAssistantMessage(
  userId: number,
  conversationId: string,
  content: string,
  contextSnapshot: any,
  toolCalls?: any[],
  pendingActions?: string[]
): Promise<number> {
  const result = await query(
    `INSERT INTO chat_messages (
      user_id, conversation_id, role, content, context_snapshot, model_used, tool_calls, pending_actions
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      userId,
      conversationId,
      'assistant',
      content,
      contextSnapshot,
      openaiConfig.model,
      toolCalls ? JSON.stringify(toolCalls) : null,
      pendingActions || [],
    ]
  );

  return result.rows[0].id;
}
