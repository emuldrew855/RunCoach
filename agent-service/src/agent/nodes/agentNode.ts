/**
 * Agent Decision Node
 *
 * Calls the LLM to decide the next action (respond or use tools).
 *
 * This node:
 * 1. Selects the appropriate model based on message content and conversation length
 * 2. Gets agent-specific configuration and tools based on intent
 * 3. Creates ChatOpenAI instance with agent-specific temperature
 * 4. Binds tools to the model (if agent has any - read-only agents have no tools)
 * 5. Invokes the model and returns the response
 */

import { BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { selectModelForChat } from '../../config/modelSelection';
import { getAgentConfig } from '../agentConfig';
import { Intent } from '../../utils/intentClassifier';
import { workoutTools } from '../tools/workoutTools';

/**
 * Agent Decision Node
 * Invokes the LLM to generate a response or decide on tool usage
 */
export async function agentNode(state: any) {
  console.log('🤖 Agent making decision...');

  // Use standard tier (gpt-4o) as default for better coaching quality
  // Only use mini tier for very simple queries
  const lastUserMessage = state.messages
    .filter((m: BaseMessage) => m._getType() === 'human')
    .slice(-1)[0]?.content?.toString() || '';

  const messageLower = lastUserMessage.toLowerCase();

  // Use mini only for extremely simple queries
  const isVerySimple = (
    messageLower.length < 20 &&
    !messageLower.includes('?') &&
    !/analyz|review|track|progress|plan|workout/i.test(messageLower)
  );

  const modelConfig = isVerySimple
    ? selectModelForChat(lastUserMessage, 0) // Will return mini
    : { model: 'gpt-4o', tier: 'standard' as const, costPerToken: 2.50 }; // Default to gpt-4o

  console.log(`📝 Using model: ${modelConfig.model} (${isVerySimple ? 'simple query' : 'coaching analysis'})`);

  // Get agent-specific configuration and tools based on intent (Phase 2: Multi-Agent)
  const intent = (state.intent || 'general_chat') as Intent;
  const agentConfig = getAgentConfig(intent, {
    shiftWorkoutTool: workoutTools[0],
    modifyWorkoutTool: workoutTools[1],
    createWorkoutTool: workoutTools[2],
    deleteWorkoutTool: workoutTools[3],
    bulkModifyWorkoutsTool: workoutTools[4],
    swapTrainingWeeksTool: workoutTools[5],
    approvePlanTool: workoutTools[6], // New tool for approving sound plans
  });

  console.log(`🔧 Agent tools: ${agentConfig.tools.length > 0 ? agentConfig.tools.map(t => t.name).join(', ') : 'NONE (read-only)'}`);

  // Create ChatOpenAI instance with agent-specific tools
  const modelWithTools = new ChatOpenAI({
    modelName: modelConfig.model,
    temperature: agentConfig.temperature, // Use agent-specific temperature
    streaming: true,
  });

  // Only bind tools if agent has any (read-only agents have no tools)
  // For plan_review intent on FIRST invocation, use tool_choice: "required" to FORCE tool calling
  // After tools execute, allow normal response generation
  let model;
  let forceToolCall = false;

  if (agentConfig.tools.length > 0) {
    // Check if this is the first agent invocation (stepCount = 1 means just context was built)
    const isFirstAgentInvocation = state.stepCount <= 2;

    // Check if there are any tool results in messages (meaning tools were already called)
    const hasToolResults = state.messages.some((m: BaseMessage) =>
      m._getType() === 'tool' || (m as any).tool_call_id
    );

    console.log(`📊 Tool call check: intent=${intent}, stepCount=${state.stepCount}, isFirst=${isFirstAgentInvocation}, hasToolResults=${hasToolResults}`);

    if ((intent === 'plan_review' || intent === 'progress_tracking') && isFirstAgentInvocation && !hasToolResults) {
      // Force the model to call at least one tool for plan review on first invocation
      forceToolCall = true;
      console.log('⚡ FORCING tool call for plan_review intent (tool_choice: "required")');
      console.log(`🔧 Available tools: ${agentConfig.tools.map(t => t.name).join(', ')}`);

      // Create model without streaming for forced tool calls (more reliable)
      const modelForTools = new ChatOpenAI({
        modelName: modelConfig.model,
        temperature: agentConfig.temperature,
        streaming: false, // Disable streaming for reliable tool calls
      });

      model = modelForTools.bindTools(agentConfig.tools, {
        tool_choice: 'required', // OpenAI standard - must call at least one tool
      });
    } else {
      // Normal tool binding - model can choose whether to call tools
      model = modelWithTools.bindTools(agentConfig.tools);
    }
  } else {
    model = modelWithTools;
  }

  // Invoke the model
  console.log('🚀 Invoking model...');
  const response = await model.invoke(state.messages);

  // Log tool calls if any
  const toolCalls = (response as any).tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`✅ Model made ${toolCalls.length} tool call(s):`);
    toolCalls.forEach((tc: any) => console.log(`   - ${tc.name}: ${JSON.stringify(tc.args).substring(0, 100)}...`));
  } else {
    console.log(`${forceToolCall ? '❌ ERROR: No tool calls despite forcing!' : 'ℹ️ No tool calls made'}`);
    if (forceToolCall) {
      console.log('Response content:', (response as any).content?.substring(0, 200));
    }
  }

  return {
    messages: [response],
    modelUsed: modelConfig.model,
    stepCount: state.stepCount + 1,
  };
}
