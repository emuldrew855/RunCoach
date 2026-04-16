/**
 * Build Context Node
 *
 * Fetches user data and conversation history from backend.
 * Includes intent classification for optimized context loading.
 *
 * This node:
 * 1. Classifies user intent to determine which context to load
 * 2. Fetches user context with intent filtering (60-87% token reduction)
 * 3. Retrieves conversation history (last 20 messages)
 * 4. Selects specialized agent configuration based on intent
 * 5. Builds specialized system prompt using agent's prompt builder
 */

import { Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { backendClient } from '../../api/backendClient';
import { classifyIntent, getIntentDescription, getExpectedContextSize, Intent } from '../../utils/intentClassifier';
import { getAgentConfig, logAgentSelection } from '../agentConfig';
import { workoutTools } from '../tools/workoutTools';

/**
 * Build Context Node
 * Prepares all context needed for the agent to make decisions
 */
export async function buildContextNode(state: any) {
  console.log('📊 Building user context...');

  try {
    // Get the latest user message for intent classification
    const userMessages = state.messages.filter((m: BaseMessage) => m._getType() === 'human');
    const latestUserMessage = userMessages[userMessages.length - 1];
    const userMessageContent = latestUserMessage?.content as string || '';

    // Classify intent to determine which context to load
    const intentResult = classifyIntent(userMessageContent);
    console.log(`🎯 Intent detected: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(0)}% confidence)`);
    console.log(`📄 ${getIntentDescription(intentResult.intent)}`);
    console.log(`💾 Expected context size: ~${getExpectedContextSize(intentResult.intent).toLocaleString()} tokens`);

    // Fetch context with intent filtering (60-87% token reduction!)
    const userContext = await backendClient.getUserContext(
      state.userId,
      intentResult.intent,
      userMessageContent
    );

    // Log the user context being passed to the agent
    console.log('\n========== AGENT SERVICE: USER CONTEXT FROM BACKEND ==========');
    console.log('User ID:', state.userId);
    console.log('Intent:', intentResult.intent);
    console.log('\n--- FULL USER CONTEXT ---');
    console.log(JSON.stringify(userContext, null, 2));
    console.log('========== END USER CONTEXT ==========\n');

    const conversationHistory = await backendClient.getConversationHistory(
      state.conversationId,
      20
    );

    // Convert conversation history to messages
    const historyMessages: BaseMessage[] = conversationHistory.map((msg: any) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      }
      return new SystemMessage(msg.content);
    });

    // Get specialized agent configuration for this intent
    const agentConfig = getAgentConfig(intentResult.intent as Intent, {
      shiftWorkoutTool: workoutTools[0],
      modifyWorkoutTool: workoutTools[1],
      createWorkoutTool: workoutTools[2],
      deleteWorkoutTool: workoutTools[3],
      bulkModifyWorkoutsTool: workoutTools[4],
      swapTrainingWeeksTool: workoutTools[5],
      approvePlanTool: workoutTools[6], // New tool for approving sound plans
    });

    // Log which agent was selected
    logAgentSelection(intentResult.intent as Intent, intentResult.confidence);

    // Build specialized system prompt using agent's prompt builder (Phase 2: Multi-Agent)
    const systemPrompt = agentConfig.promptBuilder(userContext);
    const systemMessage = new SystemMessage(systemPrompt);

    // Log the system prompt being sent to OpenAI for debugging
    console.log('\n========== AGENT SERVICE: SYSTEM PROMPT TO OPENAI ==========');
    console.log('Agent Type:', agentConfig.name);
    console.log('Intent:', intentResult.intent);
    console.log('Confidence:', (intentResult.confidence * 100).toFixed(0) + '%');
    console.log('User Message:', userMessageContent.substring(0, 100) + (userMessageContent.length > 100 ? '...' : ''));
    console.log('\n--- FULL SYSTEM PROMPT ---');
    console.log(systemPrompt);
    console.log('========== END SYSTEM PROMPT ==========\n');

    // Estimate context tokens (rough estimate: 4 chars ≈ 1 token)
    const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
    const historyTokens = historyMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
    const estimatedContextTokens = systemPromptTokens + historyTokens;

    // Determine architecture based on intent
    const architecture = intentResult.intent === 'plan_review' ? 'two_pass' : 'single_pass';

    return {
      userContext,
      messages: [systemMessage, ...historyMessages],
      intent: intentResult.intent, // Store intent in state for agent router
      intentConfidence: intentResult.confidence, // Store confidence for analytics
      architecture, // Store architecture type for analytics
      contextTokens: estimatedContextTokens, // Store estimated context tokens
      stepCount: state.stepCount + 1,
    };
  } catch (error: any) {
    console.error('❌ Failed to build context:', error);
    throw error;
  }
}
