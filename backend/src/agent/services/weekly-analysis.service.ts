/**
 * Weekly Analysis Service
 *
 * Performs automated weekly training analysis for all users.
 * Creates notifications and initiates coach conversations.
 */

import { query } from '../../config/database';
import { createNotification } from '../../models/Notification';
import { createConversation, createMessage } from '../../models/Chat';
import { buildUserContext, buildSystemPrompt } from '../../utils/contextBuilder';
import { openai, openaiConfig } from '../../config/openai';


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

    // Get AI analysis (without tools - analysis only)
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    console.log(`🤖 Calling OpenAI for analysis...`);
    const response = await openai.chat.completions.create({
      model: openaiConfig.model,
      messages,
      max_tokens: openaiConfig.maxTokens,
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0].message;
    const content = assistantMessage.content || '';

    // Save assistant message
    await createMessage({
      user_id: userId,
      conversation_id: conversation.id,
      role: 'assistant',
      content,
      context_snapshot: userContext,
      model_used: openaiConfig.model,
      tool_calls: null,
      pending_actions: [],
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
