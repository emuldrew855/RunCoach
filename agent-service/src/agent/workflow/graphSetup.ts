/**
 * Graph Workflow Setup
 *
 * Defines the LangGraph state structure and workflow.
 *
 * TWO-PASS ARCHITECTURE:
 * For plan_review and progress_tracking intents:
 *   buildContext → analysis (Pass 1) → execution (Pass 2) → tools → saveResponse
 *
 * For other intents (run_analysis, general_chat):
 *   buildContext → agent → saveResponse (unchanged single-pass)
 *
 * This module:
 * 1. Defines AgentState annotation with all state fields
 * 2. Provides router logic for two-pass vs single-pass routing
 * 3. Creates and configures the StateGraph workflow
 * 4. Connects all nodes with edges and conditional routing
 */

import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { buildContextNode } from '../nodes/buildContextNode';
import { agentNode } from '../nodes/agentNode';
import { analysisNode } from '../nodes/analysisNode';
import { executionNode } from '../nodes/executionNode';
import { toolExecutionNode, saveResponseNode } from '../nodes/toolExecutionNode';

/**
 * Define the state structure for our agent
 */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),
  userId: Annotation<number>,
  conversationId: Annotation<string>,
  userContext: Annotation<any>,
  intent: Annotation<string>, // Track which agent type to use (run_analysis, plan_review, etc.)
  modelUsed: Annotation<string>,
  tokenUsage: Annotation<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>,
  pendingActions: Annotation<any[]>,
  stepCount: Annotation<number>,
  // Two-pass architecture fields
  analysisResult: Annotation<string | null>, // Pass 1 output
  analysisVerdict: Annotation<string | null>, // SOUND | MINOR_ADJUSTMENTS | SIGNIFICANT_ISSUES
});

/**
 * Router: Decide between two-pass and single-pass after buildContext
 * Two-pass for: plan_review, progress_tracking, run_analysis
 * Single-pass for: general_chat
 */
export function routeAfterContext(state: typeof AgentState.State): string {
  const intent = state.intent || 'general_chat';

  // Two-pass architecture for all coaching intents
  if (intent === 'plan_review' || intent === 'progress_tracking' || intent === 'run_analysis') {
    console.log(`🔀 Routing to TWO-PASS architecture for intent: ${intent}`);
    return 'analysis';
  }

  // Single-pass for general chat only
  console.log(`🔀 Routing to SINGLE-PASS architecture for intent: ${intent}`);
  return 'agent';
}

/**
 * Router: After execution node, check for tool calls
 */
export function shouldContinueAfterExecution(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if last message has tool calls
  if (lastMessage?._getType() === 'ai') {
    const aiMessage = lastMessage as AIMessage;
    const hasToolCalls = (aiMessage as any).tool_calls && (aiMessage as any).tool_calls.length > 0;

    if (hasToolCalls) {
      console.log('🔧 Tool calls detected, routing to tools node');
      return 'tools';
    }
  }

  console.log('⚠️ No tool calls from execution node');
  return 'end';
}

/**
 * Router: After single-pass agent, check for tool calls or end
 */
export function shouldContinueAfterAgent(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if last message has tool calls
  if (lastMessage?._getType() === 'ai') {
    const aiMessage = lastMessage as AIMessage;
    const hasToolCalls = (aiMessage as any).tool_calls && (aiMessage as any).tool_calls.length > 0;

    if (hasToolCalls) {
      return 'tools';
    }
  }

  // Check if max steps reached
  if (state.stepCount > 10) {
    console.warn('⚠️  Max steps reached, ending workflow');
    return 'end';
  }

  return 'end';
}

/**
 * Router: After tools execution, decide whether to loop back or end
 * For two-pass: go to saveResponse (no loop back to agent)
 * For single-pass: go back to agent
 */
export function routeAfterTools(state: typeof AgentState.State): string {
  const intent = state.intent || 'general_chat';

  // For two-pass, tools are the final step before saving
  if (intent === 'plan_review' || intent === 'progress_tracking') {
    console.log('✅ Two-pass complete, saving response');
    return 'saveResponse';
  }

  // For single-pass, go back to agent
  return 'agent';
}

/**
 * Create the LangGraph workflow
 * Supports both two-pass (plan_review, progress_tracking) and single-pass (others)
 */
export function createWorkflow() {
  const workflow = new StateGraph(AgentState)
    // Add nodes
    .addNode('buildContext', buildContextNode)
    .addNode('agent', agentNode)                 // Single-pass agent
    .addNode('analysis', analysisNode)           // Two-pass: Pass 1
    .addNode('execution', executionNode)         // Two-pass: Pass 2
    .addNode('tools', toolExecutionNode)
    .addNode('saveResponse', saveResponseNode)

    // Start: always build context first
    .addEdge('__start__', 'buildContext')

    // After context: route based on intent (two-pass vs single-pass)
    .addConditionalEdges('buildContext', routeAfterContext, {
      analysis: 'analysis',  // Two-pass for plan_review/progress_tracking
      agent: 'agent',        // Single-pass for others
    })

    // Two-pass path: analysis → execution → tools → saveResponse
    .addEdge('analysis', 'execution')
    .addConditionalEdges('execution', shouldContinueAfterExecution, {
      tools: 'tools',
      end: 'saveResponse',
    })

    // Single-pass path: agent → tools → agent (loop) or saveResponse
    .addConditionalEdges('agent', shouldContinueAfterAgent, {
      tools: 'tools',
      end: 'saveResponse',
    })

    // After tools: route based on intent
    .addConditionalEdges('tools', routeAfterTools, {
      saveResponse: 'saveResponse',
      agent: 'agent',
    })

    // End
    .addEdge('saveResponse', '__end__');

  return workflow;
}
