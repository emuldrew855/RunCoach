/**
 * Weekly Analysis Service
 *
 * Performs automated weekly training analysis for all users.
 * Creates notifications and initiates coach conversations.
 */

import { query } from '../config/database';
import { createNotification } from '../models/Notification';
import { createConversation, createMessage } from '../models/Chat';
import { buildUserContext, buildSystemPrompt } from '../utils/contextBuilder';
import { openai, openaiConfig } from '../config/openai';
import { tools } from '../tools';

/**
 * Convert tools to OpenAI function format
 */
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
 * Build enhanced system prompt for weekly analysis
 */
function buildWeeklyAnalysisPrompt(userContext: any): string {
  const basePrompt = buildSystemPrompt(userContext);

  const analysisEnhancement = `

# WEEKLY ANALYSIS MODE

You are performing an automated weekly training analysis for ${userContext.firstName}. This is Monday morning, and you're checking in on their training progress.

## Your Tasks

1. **Analyze Last Week's Training**
   - Review completed vs planned workouts (adherence rate)
   - Assess training intensity and volume
   - Check HR zone distribution for proper 80/20 balance
   - Identify any concerning patterns (overtraining, insufficient recovery)

2. **Look Ahead to This Week**
   - Review this week's planned workouts
   - Assess if the plan is appropriate given last week's performance
   - Identify any potential issues (too much intensity, insufficient recovery)

3. **Provide Actionable Recommendations**
   - Be specific and concrete
   - Use your tools to suggest modifications if needed
   - Prioritize the most important changes

4. **Keep It Concise**
   - Focus on the most important insights (2-3 key points)
   - Don't overwhelm with too many suggestions at once
   - Be encouraging and supportive

## Important Guidelines

- **Be proactive**: If you see an issue, suggest a concrete fix using your tools
- **Be data-driven**: Reference specific metrics (adherence %, HR zones, weekly volume)
- **Be practical**: Focus on actionable changes for this week
- **Be supportive**: Celebrate successes and frame concerns constructively

## Example Opening

"Good morning ${userContext.firstName}! 🌅 Time for your weekly training check-in.

**Last Week Recap:**
✓ Completed 4 of 5 planned workouts (80% adherence)
⚠️ HR zones: 65% in Zone 1-2 (target: 80%) - you're training a bit too hard

**This Week Ahead:**
You have 5 runs planned totaling 42km. However, I notice..."

Then provide 2-3 specific recommendations with tool calls if appropriate.`;

  return basePrompt + analysisEnhancement;
}

/**
 * Perform weekly analysis for a single user
 */
export async function performWeeklyAnalysis(userId: number): Promise<{
  success: boolean;
  conversationId?: string;
  error?: string;
}> {
  try {
    console.log(`📊 Starting weekly analysis for user ${userId}`);

    // Build user context
    const userContext = await buildUserContext(userId);

    // Check if user has active training plan
    if (!userContext.activePlan) {
      console.log(`⏭️ User ${userId} has no active training plan, skipping analysis`);
      return { success: true }; // Not an error, just skip
    }

    // Create or find "Weekly Analysis" conversation
    const conversationTitle = `Weekly Analysis - ${new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })}`;

    const conversation = await createConversation(userId, conversationTitle);
    console.log(`💬 Created conversation ${conversation.id} for user ${userId}`);

    // Build analysis prompt
    const systemPrompt = buildWeeklyAnalysisPrompt(userContext);
    const userMessage = `Please perform my weekly training analysis for this week.`;

    // Save user message (system-initiated)
    await createMessage({
      user_id: userId,
      conversation_id: conversation.id,
      role: 'user',
      content: userMessage,
      context_snapshot: userContext,
      model_used: openaiConfig.model,
      is_agent_initiated: true,
    });

    // Get AI analysis
    const openaiTools = convertToolsForOpenAI();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    console.log(`🤖 Calling OpenAI for analysis...`);
    const response = await openai.chat.completions.create({
      model: openaiConfig.model,
      messages,
      tools: openaiTools as any,
      tool_choice: 'auto',
      max_tokens: openaiConfig.maxTokens,
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0].message;
    const content = assistantMessage.content || '';
    const toolCalls = assistantMessage.tool_calls;

    // Save assistant message
    await createMessage({
      user_id: userId,
      conversation_id: conversation.id,
      role: 'assistant',
      content,
      context_snapshot: userContext,
      model_used: openaiConfig.model,
      tool_calls: toolCalls ? toolCalls : undefined,
      is_agent_initiated: true,
    });

    console.log(`✅ Analysis complete for user ${userId}`);

    // Create notification
    await createNotification(
      userId,
      'weekly_analysis',
      '📊 Your Weekly Training Analysis is Ready',
      'Check out your personalized training insights and recommendations for this week.',
      `/chat?conversation=${conversation.id}`
    );

    console.log(`🔔 Notification created for user ${userId}`);

    return {
      success: true,
      conversationId: conversation.id,
    };
  } catch (error: any) {
    console.error(`❌ Weekly analysis failed for user ${userId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Perform weekly analysis for all active users
 */
export async function performWeeklyAnalysisForAllUsers(): Promise<{
  total: number;
  successful: number;
  failed: number;
}> {
  try {
    console.log('🚀 Starting weekly analysis job for all users...');

    // Get all users with active training plans
    const result = await query(
      `SELECT DISTINCT u.id, u.first_name
       FROM users u
       INNER JOIN training_plans tp ON u.id = tp.user_id
       WHERE tp.is_active = true`,
      []
    );

    const users = result.rows;
    console.log(`👥 Found ${users.length} users with active training plans`);

    let successful = 0;
    let failed = 0;

    // Process each user
    for (const user of users) {
      const result = await performWeeklyAnalysis(user.id);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Add small delay between users to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Weekly analysis job complete: ${successful} successful, ${failed} failed`);

    return {
      total: users.length,
      successful,
      failed,
    };
  } catch (error: any) {
    console.error('❌ Weekly analysis job failed:', error);
    throw error;
  }
}
