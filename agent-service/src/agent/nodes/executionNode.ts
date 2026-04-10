/**
 * Execution Node (Pass 2 of Two-Pass Architecture)
 *
 * Executes tool calls based on the analysis from Pass 1.
 * This node ONLY calls tools - no new reasoning.
 *
 * This node:
 * 1. Uses the execution-specific prompt (buildExecutionPassPrompt)
 * 2. Has ALL tools bound with tool_choice: "required"
 * 3. Reads the analysis from Pass 1
 * 4. Executes the recommended modifications via tools
 * 5. Returns tool calls for the tool execution node to process
 */

import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { buildExecutionPassPrompt } from '../../config/specializedPrompts';
import { getAgentConfig } from '../agentConfig';
import { workoutTools } from '../tools/workoutTools';
import { Intent } from '../../utils/intentClassifier';

/**
 * Execution Node (Pass 2)
 * Executes tool calls based on Pass 1 analysis
 */
export async function executionNode(state: any) {
  console.log('⚡ Pass 2: Execution Node - Tool calls only...');

  // Run execution for all coaching intents that use two-pass architecture
  const intent = (state.intent || 'general_chat') as Intent;
  if (intent !== 'plan_review' && intent !== 'progress_tracking' && intent !== 'run_analysis') {
    console.log(`ℹ️ Skipping execution pass for intent: ${intent}`);
    return {
      stepCount: state.stepCount + 1,
    };
  }

  // Check if we have analysis result
  const analysisResult = state.analysisResult;
  if (!analysisResult) {
    console.error('❌ No analysis result from Pass 1');
    return {
      messages: [new SystemMessage('Error: No analysis available for execution.')],
      stepCount: state.stepCount + 1,
    };
  }

  // Determine if the analysis recommends modifications
  // If analysis says plan is sound/good or no changes needed, don't force tool calls
  const indicatesNoChanges = (
    /plan.*(is |looks )?(sound|good|solid|fine|appropriate)/i.test(analysisResult) ||
    /no (changes|modifications|adjustments) (needed|required|necessary)/i.test(analysisResult) ||
    /approve.*(as.?is|current|plan)/i.test(analysisResult) ||
    /verdict.*(excellent|good|on.?track)/i.test(analysisResult)
  );

  const indicatesChangesNeeded = (
    /recommend.*(modify|change|delete|shift|adjust|remove)/i.test(analysisResult) ||
    /(delete|remove|shift|modify|adjust).*(workout|run|session)/i.test(analysisResult) ||
    /verdict.*(concerning|poor|at.?risk|needs.?work)/i.test(analysisResult) ||
    /issue.*(#|1|2|3)/i.test(analysisResult) // Numbered issues indicate changes needed
  );

  // Decide whether to force tool calls based on analysis content
  const shouldForceToolCall = indicatesChangesNeeded || !indicatesNoChanges;
  console.log(`📊 Analysis indicates: ${indicatesNoChanges ? 'NO changes needed' : indicatesChangesNeeded ? 'changes needed' : 'unclear'}`);

  // Build the execution prompt with analysis result
  const executionPrompt = buildExecutionPassPrompt(state.userContext, analysisResult);

  // Create messages for execution pass
  const executionMessages: BaseMessage[] = [
    new SystemMessage(executionPrompt),
    new HumanMessage('Execute the modifications from the analysis above.'),
  ];

  // Get agent config with tools
  const agentConfig = getAgentConfig(intent, {
    shiftWorkoutTool: workoutTools[0],
    modifyWorkoutTool: workoutTools[1],
    createWorkoutTool: workoutTools[2],
    deleteWorkoutTool: workoutTools[3],
    bulkModifyWorkoutsTool: workoutTools[4],
    swapTrainingWeeksTool: workoutTools[5],
    approvePlanTool: workoutTools[6],
  });

  // Create model WITHOUT streaming for reliable tool calls
  const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.1, // Very low temperature for consistent tool execution
    streaming: false,
  });

  // Bind tools - only force tool calls if analysis recommends changes
  // If plan is sound, allow model to choose (which will likely be approve_plan or no tool)
  const modelWithTools = shouldForceToolCall
    ? model.bindTools(agentConfig.tools, { tool_choice: 'required' })
    : model.bindTools(agentConfig.tools); // Let model decide

  console.log(`🔧 Execution tools bound: ${agentConfig.tools.map(t => t.name).join(', ')}`);
  console.log(shouldForceToolCall
    ? '⚡ FORCING tool call (tool_choice: "required") - analysis recommends changes'
    : '✅ Tool call optional (analysis indicates plan is sound)');

  try {
    const response = await modelWithTools.invoke(executionMessages);

    // Log tool calls
    const toolCalls = (response as any).tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      console.log(`✅ Pass 2 made ${toolCalls.length} tool call(s):`);
      toolCalls.forEach((tc: any) => console.log(`   - ${tc.name}: ${JSON.stringify(tc.args).substring(0, 100)}...`));
    } else {
      console.log('❌ WARNING: No tool calls despite tool_choice: "required"');
      console.log('Response content:', response.content?.toString().substring(0, 200));
    }

    return {
      messages: [response],
      modelUsed: 'gpt-4o',
      stepCount: state.stepCount + 1,
    };
  } catch (error: any) {
    console.error('❌ Execution pass failed:', error);
    return {
      messages: [new SystemMessage(`Error executing tools: ${error.message}`)],
      stepCount: state.stepCount + 1,
    };
  }
}
