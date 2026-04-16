/**
 * Tool Execution Node
 *
 * Executes the tools requested by the agent.
 *
 * This node:
 * 1. Extracts tool calls from the last AI message
 * 2. Executes each tool with the provided arguments
 * 3. Creates tool messages with results
 * 4. Returns tool results to be added to conversation state
 */

import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { workoutTools } from '../tools/workoutTools';

/**
 * Tool Execution Node
 * Runs the tools requested by the agent
 */
export async function toolExecutionNode(state: any) {
  console.log('🔧 Executing tools...');

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = (lastMessage as any).tool_calls || [];

  if (toolCalls.length === 0) {
    return state;
  }

  // Execute each tool
  const toolResults: BaseMessage[] = [];

  for (const toolCall of toolCalls) {
    const tool = workoutTools.find((t) => t.name === toolCall.name);

    if (!tool) {
      console.error(`❌ Unknown tool: ${toolCall.name}`);
      continue;
    }

    try {
      console.log(`⚙️  Executing ${toolCall.name} with args:`, toolCall.args);
      const result = await tool.invoke(toolCall.args);

      // Create tool message
      toolResults.push({
        type: 'tool',
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      } as any);
    } catch (error: any) {
      console.error(`❌ Tool ${toolCall.name} failed:`, error);
      toolResults.push({
        type: 'tool',
        content: JSON.stringify({ success: false, error: error.message }),
        tool_call_id: toolCall.id,
        name: toolCall.name,
      } as any);
    }
  }

  return {
    messages: toolResults,
    stepCount: state.stepCount + 1,
  };
}

/**
 * Save Response Node
 * Saves the final response to the backend (extracted from original graphAgent.ts)
 *
 * For two-pass architecture:
 * - Uses analysisResult as the primary response content
 * - Appends tool execution summary
 */
export async function saveResponseNode(state: any) {
  console.log('💾 Saving response...');

  const { backendClient } = await import('../../api/backendClient');

  const lastAIMessage = [...state.messages]
    .reverse()
    .find((m: BaseMessage) => m._getType() === 'ai') as AIMessage;

  if (!lastAIMessage) {
    return state;
  }

  // For two-pass architecture, prefer analysisResult over empty execution response
  let responseContent = lastAIMessage.content?.toString() || '';

  // If we have an analysis result (two-pass), use it as the main content
  if (state.analysisResult && (!responseContent || responseContent.length < 50)) {
    console.log('📋 Using analysis result as response content (two-pass architecture)');

    // Build tool call summary from tool messages
    const toolSummaries: string[] = [];
    for (const message of state.messages) {
      if (message._getType() === 'tool') {
        const toolMessage = message as any;
        try {
          const result = JSON.parse(toolMessage.content as string);
          if (result.pending && result.action) {
            toolSummaries.push(`- **${result.action}**: ${result.summary || result.message || 'Pending approval'}`);
          }
        } catch (e) {
          // Not JSON - continue
        }
      }
    }

    const toolSection = toolSummaries.length > 0
      ? `\n\n---\n\n## Recommended Changes (Pending Your Approval)\n\n${toolSummaries.join('\n')}\n\n*Review and approve/reject each change using the buttons above.*`
      : '';

    responseContent = state.analysisResult + toolSection;
  }

  // Final fallback - ensure we have some content to save
  if (!responseContent || responseContent.trim().length === 0) {
    console.log('⚠️ No response content available, using fallback');
    responseContent = 'I\'ve analyzed your training plan and made some recommendations. Please review the pending changes above.';
  }

  // Collect pending actions from tool results
  const pendingActions: any[] = [];
  for (const message of state.messages) {
    if (message._getType() === 'tool') {
      const toolMessage = message as any;
      try {
        const result = JSON.parse(toolMessage.content as string);
        if (result.pending && result.pendingAction) {
          pendingActions.push(result.pendingAction);
        }
      } catch (e) {
        // Not JSON or doesn't have pending action - continue
      }
    }
  }

  // Log what we're about to save
  console.log(`📝 Saving response: ${responseContent.length} chars, ${pendingActions.length} pending actions`);

  // Collect tools used from tool messages
  const toolsUsed: string[] = [];
  for (const message of state.messages) {
    if (message._getType() === 'tool') {
      const toolMessage = message as any;
      if (toolMessage.name && !toolsUsed.includes(toolMessage.name)) {
        toolsUsed.push(toolMessage.name);
      }
    }
  }

  // Calculate response time
  const responseTimeMs = state.startTime ? Date.now() - state.startTime : 0;

  // Save to backend
  try {
    await backendClient.saveAssistantMessage(
      state.userId,
      state.conversationId,
      responseContent,
      state.userContext,
      undefined, // tool calls
      pendingActions.length > 0 ? pendingActions : undefined // pending actions
    );

    // Track enhanced agent usage analytics
    const usage = (lastAIMessage as any).usage_metadata;
    if (usage && state.modelUsed) {
      await backendClient.trackAgentUsage(
        state.userId,
        state.conversationId,
        {
          promptTokens: usage.input_tokens || 0,
          completionTokens: usage.output_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          model: state.modelUsed,
          requestType: 'agent',
          // Extended analytics
          intent: state.intent || 'general_chat',
          intentConfidence: state.intentConfidence || 0,
          architecture: state.architecture || 'single_pass',
          responseTimeMs,
          contextTokens: state.contextTokens || 0,
          toolCallsCount: toolsUsed.length,
          toolsUsed,
        }
      );
    }
  } catch (error: any) {
    console.error('❌ Failed to save response:', error.message);
    console.error('   Response content length:', responseContent?.length || 0);
    console.error('   Pending actions count:', pendingActions.length);
    if (error.response?.data) {
      console.error('   Server response:', error.response.data);
    }
  }

  return {
    stepCount: state.stepCount + 1,
  };
}
