/**
 * Synthesizer Node
 *
 * Merges outputs from multiple workers into a coherent response.
 * Used when the supervisor routes to more than one worker.
 *
 * Model: gpt-4o-mini (formatting/merging only - cost effective)
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import {
  SupervisorStateType,
  WorkerOutput,
  PendingAction,
} from '../workflow/supervisorState';
import { backendClient } from '../../api/backendClient';

/**
 * Synthesizer Node - Merges worker outputs
 */
export async function synthesizerNode(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n🔄 ========== SYNTHESIZER NODE ==========');

  const outputs = state.workerOutputs || [];
  console.log(`Worker outputs to merge: ${outputs.length}`);

  // If single worker output, pass through directly
  if (outputs.length <= 1) {
    console.log('Single worker output - passing through directly');
    console.log('==========================================\n');

    const output = outputs[0];
    return {
      messages: [new AIMessage(output?.content || 'No response generated.')],
      pendingActions: output?.pendingActions || [],
      stepCount: state.stepCount + 1,
    };
  }

  // Multiple workers - need to synthesize
  console.log('Multiple worker outputs - synthesizing...');

  try {
    const coreContext = state.contextTiers.core;
    const synthModel = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.5,
    });

    // Build synthesis prompt
    const workerOutputsText = outputs
      .map(
        (o) => `## ${o.worker.toUpperCase()} ANALYSIS:\n${o.content}\n`
      )
      .join('\n---\n\n');

    const synthesisPrompt = `You are combining expert analyses from multiple specialists into a coherent coaching response for ${coreContext?.firstName || 'the athlete'}.

Coach Style: ${coreContext?.coachStyle || 'balanced'}

WORKER OUTPUTS:
${workerOutputsText}

INSTRUCTIONS:
1. Combine the insights into a unified, coherent response
2. Maintain the athlete's preferred coach personality (${coreContext?.coachStyle || 'balanced'})
3. Don't repeat the same information multiple times
4. Highlight the most actionable insights first
5. Keep recommendations specific and numbered
6. If there are pending actions (plan changes), summarize them at the end
7. Keep the response concise but comprehensive

Create the unified coaching response now.`;

    const response = await synthModel.invoke([
      new SystemMessage(synthesisPrompt),
    ]);

    // Extract usage metrics
    const usage = (response as any).usage_metadata;
    const tokensUsed = usage?.total_tokens || 0;

    console.log(`Synthesis complete (${tokensUsed} tokens)`);
    console.log('==========================================\n');

    // Collect all pending actions from all workers
    const allPendingActions: PendingAction[] = outputs.flatMap(
      (o) => o.pendingActions || []
    );

    return {
      messages: [response as AIMessage],
      pendingActions: allPendingActions,
      stepCount: state.stepCount + 1,
      modelUsed: {
        ...state.modelUsed,
        synthesizer: 'gpt-4o-mini',
      },
    };
  } catch (error) {
    console.error('❌ Synthesizer Error:', error);

    // Fallback: concatenate outputs
    const fallbackContent = outputs
      .map((o) => `**${o.worker.toUpperCase()}:**\n${o.content}`)
      .join('\n\n---\n\n');

    return {
      messages: [new AIMessage(fallbackContent)],
      pendingActions: outputs.flatMap((o) => o.pendingActions || []),
      error: `Synthesizer fallback: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}

/**
 * Save Response Node - Saves final response to backend
 */
export async function saveResponseNode(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n💾 ========== SAVE RESPONSE NODE ==========');

  try {
    // Get the final response content
    const lastMessage = state.messages[state.messages.length - 1];
    const content =
      lastMessage?._getType() === 'ai'
        ? (lastMessage as AIMessage).content.toString()
        : 'No response generated.';

    // Build context snapshot for debugging
    const contextSnapshot = {
      routingDecision: state.routingDecision,
      activeWorkers: state.activeWorkers,
      contextTiersLoaded: {
        core: !!state.contextTiers?.core,
        active: !!state.contextTiers?.active,
        deep: !!state.contextTiers?.deep,
      },
      tokenUsage: state.tokenUsage,
      modelUsed: state.modelUsed,
    };

    // Get tool calls from worker outputs
    const toolCalls = state.workerOutputs?.flatMap((o) => o.toolCalls || []) || [];

    // Save to backend
    await backendClient.saveAssistantMessage(
      state.userId,
      state.conversationId,
      content,
      contextSnapshot,
      toolCalls.length > 0 ? toolCalls : undefined,
      state.pendingActions?.length > 0 ? state.pendingActions : undefined
    );

    // Track token usage
    const totalTokens = state.workerOutputs?.reduce(
      (sum, o) => sum + (o.tokensUsed || 0),
      0
    ) || 0;

    if (totalTokens > 0) {
      await backendClient.trackTokenUsage(
        state.userId,
        state.conversationId,
        {
          promptTokens: Math.round(totalTokens * 0.7), // Estimate
          completionTokens: Math.round(totalTokens * 0.3),
          totalTokens,
        },
        Object.values(state.modelUsed || {}).join(', '),
        'supervisor_chat'
      );
    }

    console.log('✅ Response saved');
    console.log('==========================================\n');

    return {
      stepCount: state.stepCount + 1,
    };
  } catch (error) {
    console.error('❌ Save Response Error:', error);
    return {
      error: `Save error: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}

/**
 * Check if synthesis is needed (multiple workers produced output)
 */
export function needsSynthesis(state: SupervisorStateType): boolean {
  return (state.workerOutputs?.length || 0) > 1;
}
