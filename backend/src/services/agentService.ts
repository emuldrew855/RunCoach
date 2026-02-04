/**
 * Agent Service
 *
 * Main orchestrator for the agentic coach system using OpenAI Agents SDK.
 * Handles conversation processing, tool calling, and the confirmation layer.
 */

import { openai } from '../config/openai';
import { tools, requiresApproval, isReadOnly, validateToolParams } from '../tools';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

interface PendingAction {
  id: string;
  action_type: string;
  action_payload: any;
  agent_reasoning: string;
}

interface ToolCallResult {
  requiresApproval: boolean;
  pendingAction?: PendingAction;
  result?: any;
  error?: string;
}

/**
 * Create a pending action in the database
 */
async function createPendingAction(
  userId: number,
  conversationId: string,
  messageId: number,
  actionType: string,
  actionPayload: any,
  reasoning: string
): Promise<PendingAction> {
  const actionId = uuidv4();

  const result = await query(
    `INSERT INTO pending_actions (
      id, user_id, conversation_id, message_id,
      action_type, action_payload, agent_reasoning, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, action_type, action_payload, agent_reasoning`,
    [actionId, userId, conversationId, messageId, actionType, actionPayload, reasoning, 'pending']
  );

  return result.rows[0];
}

/**
 * Execute read-only tool immediately
 */
async function executeReadOnlyTool(
  toolName: string,
  params: any,
  userId: number
): Promise<any> {
  switch (toolName) {
    case 'analyze_performance':
      return await analyzePerformance(params, userId);
    default:
      throw new Error(`Unknown read-only tool: ${toolName}`);
  }
}

/**
 * Analyze performance tool implementation
 */
async function analyzePerformance(
  params: { activity_ids?: number[]; date_range_days?: number; focus_area: string },
  userId: number
): Promise<any> {
  const { activity_ids, date_range_days = 7, focus_area } = params;

  // Fetch activities based on parameters
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

  // Perform analysis based on focus area
  const analysis: any = {
    activities_analyzed: activities.length,
    date_range: `Last ${date_range_days} days`,
    focus_area,
  };

  switch (focus_area) {
    case 'pacing':
      analysis.pacing_analysis = analyzePacing(activities);
      break;
    case 'hr_zones':
      analysis.hr_zone_analysis = analyzeHRZones(activities);
      break;
    case 'progression':
      analysis.progression_analysis = analyzeProgression(activities);
      break;
    case 'recovery':
      analysis.recovery_analysis = analyzeRecovery(activities);
      break;
    case 'overall':
      analysis.pacing_analysis = analyzePacing(activities);
      analysis.hr_zone_analysis = analyzeHRZones(activities);
      analysis.progression_analysis = analyzeProgression(activities);
      analysis.recovery_analysis = analyzeRecovery(activities);
      break;
  }

  return analysis;
}

/**
 * Helper analysis functions
 */
function analyzePacing(activities: any[]): any {
  const runs = activities.filter(a => a.average_pace);
  if (runs.length === 0) return { summary: 'No pacing data available' };

  const paces = runs.map(a => a.average_pace);
  const avgPace = paces.reduce((sum, p) => sum + p, 0) / paces.length;
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);

  return {
    average_pace_min_km: avgPace.toFixed(2),
    fastest_pace_min_km: minPace.toFixed(2),
    slowest_pace_min_km: maxPace.toFixed(2),
    pace_variation: (maxPace - minPace).toFixed(2),
    consistency: maxPace - minPace < 1.0 ? 'Good' : 'Variable',
  };
}

function analyzeHRZones(activities: any[]): any {
  const runsWithHR = activities.filter(a => a.average_hr);
  if (runsWithHR.length === 0) return { summary: 'No heart rate data available' };

  const avgHR = runsWithHR.reduce((sum, a) => sum + a.average_hr, 0) / runsWithHR.length;
  const maxHR = Math.max(...runsWithHR.map(a => a.max_hr || 0));

  // Simple zone estimation (this can be improved with user-specific zones)
  const zone1Count = runsWithHR.filter(a => a.average_hr < 140).length;
  const zone2Count = runsWithHR.filter(a => a.average_hr >= 140 && a.average_hr < 155).length;
  const zone3Count = runsWithHR.filter(a => a.average_hr >= 155 && a.average_hr < 170).length;
  const zone4Count = runsWithHR.filter(a => a.average_hr >= 170).length;

  return {
    average_hr: Math.round(avgHR),
    max_hr_recorded: maxHR,
    zone_distribution: {
      zone1_easy: zone1Count,
      zone2_moderate: zone2Count,
      zone3_tempo: zone3Count,
      zone4_hard: zone4Count,
    },
    training_intensity: zone3Count + zone4Count > runsWithHR.length / 2 ? 'High' : 'Moderate',
  };
}

function analyzeProgression(activities: any[]): any {
  if (activities.length < 2) return { summary: 'Need at least 2 activities for progression analysis' };

  const sortedActivities = [...activities].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const firstWeekDistance = sortedActivities.slice(0, Math.min(7, Math.ceil(sortedActivities.length / 2)))
    .reduce((sum, a) => sum + (a.distance_meters || 0), 0);
  const lastWeekDistance = sortedActivities.slice(-Math.min(7, Math.ceil(sortedActivities.length / 2)))
    .reduce((sum, a) => sum + (a.distance_meters || 0), 0);

  const volumeChange = ((lastWeekDistance - firstWeekDistance) / firstWeekDistance * 100).toFixed(1);

  return {
    first_period_distance_km: (firstWeekDistance / 1000).toFixed(1),
    recent_period_distance_km: (lastWeekDistance / 1000).toFixed(1),
    volume_change_percent: volumeChange,
    trend: parseFloat(volumeChange) > 10 ? 'Increasing' : parseFloat(volumeChange) < -10 ? 'Decreasing' : 'Stable',
  };
}

function analyzeRecovery(activities: any[]): any {
  if (activities.length < 2) return { summary: 'Need at least 2 activities for recovery analysis' };

  const sortedActivities = [...activities].sort((a, b) =>
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  let totalRestDays = 0;
  let restPeriods = 0;

  for (let i = 1; i < sortedActivities.length; i++) {
    const daysBetween = Math.floor(
      (new Date(sortedActivities[i].start_date).getTime() -
       new Date(sortedActivities[i - 1].start_date).getTime()) /
      (1000 * 60 * 60 * 24)
    );
    if (daysBetween > 1) {
      totalRestDays += daysBetween - 1;
      restPeriods++;
    }
  }

  const avgRestDays = restPeriods > 0 ? (totalRestDays / restPeriods).toFixed(1) : 0;

  return {
    total_rest_days: totalRestDays,
    rest_periods: restPeriods,
    average_rest_between_runs: avgRestDays,
    recovery_adequacy: parseFloat(avgRestDays as string) >= 1 ? 'Good' : 'Limited',
  };
}

/**
 * Process tool call with confirmation layer
 */
async function processToolCall(
  toolName: string,
  params: any,
  userId: number,
  conversationId: string,
  messageId: number,
  reasoning: string
): Promise<ToolCallResult> {
  try {
    // Validate parameters
    const validatedParams = validateToolParams(toolName, params);

    // Check if tool requires approval
    if (requiresApproval(toolName)) {
      // Create pending action
      const pendingAction = await createPendingAction(
        userId,
        conversationId,
        messageId,
        toolName,
        validatedParams,
        reasoning
      );

      return {
        requiresApproval: true,
        pendingAction,
      };
    }

    // Execute read-only tool immediately
    if (isReadOnly(toolName)) {
      const result = await executeReadOnlyTool(toolName, validatedParams, userId);
      return {
        requiresApproval: false,
        result,
      };
    }

    throw new Error(`Unknown tool category: ${toolName}`);
  } catch (error: any) {
    return {
      requiresApproval: false,
      error: error.message || 'Tool execution failed',
    };
  }
}

/**
 * Build context for agent about user's training
 */
async function buildAgentContext(userId: number): Promise<string> {
  // Get active training plan
  const planResult = await query(
    'SELECT * FROM training_plans WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  if (planResult.rows.length === 0) {
    return 'User does not have an active training plan.';
  }

  const plan = planResult.rows[0];

  // Get upcoming workouts
  const workoutsResult = await query(
    `SELECT * FROM planned_workouts
     WHERE training_plan_id = $1
     AND scheduled_date >= CURRENT_DATE
     AND scheduled_date <= CURRENT_DATE + INTERVAL '14 days'
     ORDER BY scheduled_date ASC
     LIMIT 10`,
    [plan.id]
  );

  const workouts = workoutsResult.rows;

  // Get recent activities
  const activitiesResult = await query(
    `SELECT * FROM activities
     WHERE user_id = $1
     AND start_date >= CURRENT_DATE - INTERVAL '14 days'
     ORDER BY start_date DESC
     LIMIT 10`,
    [userId]
  );

  const activities = activitiesResult.rows;

  // Build context string
  let context = `# Training Context\n\n`;
  context += `## Active Training Plan\n`;
  context += `- Name: ${plan.name}\n`;
  context += `- Start: ${plan.start_date}\n`;
  context += `- End: ${plan.end_date}\n`;
  context += `- Total Weeks: ${plan.total_weeks}\n\n`;

  if (workouts.length > 0) {
    context += `## Upcoming Workouts (Next 14 days)\n`;
    workouts.forEach((w: any) => {
      context += `- ${w.scheduled_date}: ${w.name || w.workout_type} - ${w.target_distance_meters ? (w.target_distance_meters / 1000).toFixed(1) + 'km' : 'N/A'}\n`;
    });
    context += `\n`;
  }

  if (activities.length > 0) {
    context += `## Recent Activities (Last 14 days)\n`;
    activities.forEach((a: any) => {
      context += `- ${a.start_date}: ${(a.distance_meters / 1000).toFixed(1)}km, Pace: ${a.average_pace?.toFixed(2) || 'N/A'} min/km\n`;
    });
  }

  return context;
}

/**
 * Process chat message with agent
 */
export async function processAgentChat(
  userId: number,
  conversationId: string,
  messageId: number,
  userMessage: string
): Promise<AsyncGenerator<string, void, unknown>> {
  // Build context about user's training
  const trainingContext = await buildAgentContext(userId);

  // System message for the agent
  const systemMessage = `You are an expert running coach AI agent. You help athletes optimize their training plans through conversation and proactive suggestions.

${trainingContext}

## Your Capabilities

You have access to the following tools to help athletes:

1. **shift_workout**: Move a planned workout to a different date (requires user approval)
2. **modify_workout**: Adjust workout intensity, distance, or pace (requires user approval)
3. **create_workout**: Add a new workout to the plan (requires user approval)
4. **delete_workout**: Remove a workout from the plan (requires user approval)
5. **analyze_performance**: Analyze recent training data (executes immediately)

## Important Guidelines

- Always provide clear reasoning when suggesting changes to the training plan
- Be proactive in identifying potential issues (overtraining, insufficient recovery, poor pacing)
- When suggesting modifications, explain the benefits and potential trade-offs
- Remember that modification tools require user approval - the user will see your suggestion and can approve or reject it
- Use the analyze_performance tool freely to provide data-driven insights
- Keep responses conversational and supportive, like a coach would talk to their athlete
- Consider the athlete's goals, recent performance, and upcoming workouts when making suggestions

## Current Date
${new Date().toISOString().split('T')[0]}`;

  // For now, return a simple generator that yields the OpenAI response
  // This is a simplified implementation - full agent integration with streaming will be done in Phase 2
  return (async function* () {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      console.error('Agent chat error:', error);
      yield `I apologize, but I encountered an error processing your request: ${error.message}`;
    }
  })();
}

export {
  processToolCall,
  buildAgentContext,
};
