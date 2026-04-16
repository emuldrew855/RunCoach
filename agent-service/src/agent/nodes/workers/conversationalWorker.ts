/**
 * Conversational Worker
 *
 * Specialized worker for general questions, motivation, and quick advice.
 *
 * Handles:
 * - "Should I run today?"
 * - "Give me some motivation"
 * - "What is negative splitting?"
 * - "Any tips for race day?"
 *
 * Context Tier: CORE (~1k tokens) - Minimal data needed
 * Tools: get_user_profile, get_this_week_adherence (read-only)
 * Model: gpt-4o (quality responses)
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SupervisorStateType, WorkerOutput } from '../../workflow/supervisorState';
import { backendClient } from '../../../api/backendClient';
import { conversationalTools } from '../../tools/dataTools';

/**
 * Build the conversational system prompt
 */
function buildConversationalPrompt(coreContext: any): string {
  return `You are a friendly and knowledgeable running coach assistant.

ATHLETE PROFILE:
- Name: ${coreContext.firstName}
- Goal: ${coreContext.goalType || 'General fitness'}${coreContext.goalPace ? ` at ${coreContext.goalPace}` : ''}
- Training Phase: ${coreContext.trainingPhase || 'Unknown'}
- Weeks to Goal: ${coreContext.weeksRemaining || 'N/A'}
- Experience: ${coreContext.experienceYears || 'Unknown'} years
- Coach Style Preference: ${coreContext.coachStyle}

COACHING PERSONALITY:
${getCoachPersonality(coreContext.coachStyle)}

GUIDELINES:
1. Be helpful, encouraging, and knowledgeable
2. Tailor advice to the athlete's experience level
3. Consider their current training phase when giving advice
4. Keep responses concise but informative
5. Use the athlete's name occasionally for personalization
6. If asked about specific runs or plan details, suggest they ask a more specific question

IMPORTANT: Respond directly to the question. Do not say "Let me..." or "I'll..." - just answer.
Keep responses focused and actionable.`;
}

/**
 * Get coach personality based on preference
 */
function getCoachPersonality(style: string): string {
  const personalities: Record<string, string> = {
    'motivational': `Be highly encouraging and positive. Focus on building confidence and celebrating small wins.
Use enthusiastic language and remind the athlete of their capabilities.`,

    'analytical': `Be data-driven and precise. Focus on the science and logic behind training principles.
Provide detailed explanations and reference research when relevant.`,

    'tough_love': `Be direct and no-nonsense. Focus on accountability and high standards.
Challenge the athlete to push their limits while remaining supportive.`,

    'balanced': `Strike a balance between encouragement and honest feedback.
Adapt your tone to what the athlete seems to need in the moment.`,

    'supportive': `Be warm and understanding. Focus on the athlete's wellbeing and enjoyment.
Emphasize sustainable progress over aggressive goals.`,
  };

  return personalities[style] || personalities['balanced'];
}

/**
 * Conversational Worker Node
 */
export async function conversationalWorker(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n💬 ========== CONVERSATIONAL WORKER ==========');
  console.log(`User Query: "${state.userQuery.substring(0, 100)}..."`);

  try {
    // Load minimal context (core only)
    console.log('📦 Loading CORE context...');
    const coreContext = state.contextTiers.core || await backendClient.getCoreContext(state.userId);

    // Build conversational prompt
    const systemPrompt = buildConversationalPrompt(coreContext);

    // Create model WITHOUT tools - core context is sufficient for general questions
    const model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.7, // More creative for conversation
    });

    // Invoke model - limit history to last 2 messages to prevent context bleeding
    // Only include recent context for follow-up questions
    const recentHistory = state.messages.slice(-2).filter(m => m._getType() === 'ai');

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      ...recentHistory,
      new HumanMessage(state.userQuery),
    ]);

    // Extract usage metrics
    const usage = (response as any).usage_metadata;
    const tokensUsed = usage?.total_tokens || 0;

    console.log(`✅ Conversational Worker complete (${tokensUsed} tokens)`);
    console.log('==============================================\n');

    // Build worker output
    const workerOutput: WorkerOutput = {
      worker: 'conversational',
      content: response.content.toString(),
      toolCalls: (response as any).tool_calls,
      tokensUsed,
      modelUsed: 'gpt-4o',
    };

    return {
      workerOutputs: [workerOutput],
      contextTiers: {
        ...state.contextTiers,
        core: coreContext,
      },
      messages: [...state.messages, response as AIMessage],
      stepCount: state.stepCount + 1,
      currentWorker: 'conversational',
      modelUsed: {
        ...state.modelUsed,
        conversational: 'gpt-4o',
      },
    };
  } catch (error) {
    console.error('❌ Conversational Worker Error:', error);

    return {
      workerOutputs: [
        {
          worker: 'conversational',
          content: `I encountered an error. ${error}`,
          tokensUsed: 0,
          modelUsed: 'gpt-4o',
        },
      ],
      error: `Conversational error: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}
