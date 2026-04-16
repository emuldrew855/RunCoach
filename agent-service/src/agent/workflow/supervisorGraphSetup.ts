/**
 * Supervisor Graph Setup
 *
 * Defines the LangGraph workflow for the Orchestrator-Worker multi-agent architecture.
 *
 * Architecture:
 *   __start__ → supervisor → [worker(s)] → synthesizer → saveResponse → __end__
 *
 * Workers:
 *   - historian: Historical progress, RAG, trends
 *   - analyst: Run analysis, performance metrics
 *   - architect: Plan review, workout modifications (two-pass preserved)
 *   - conversational: General questions, motivation
 */

import { StateGraph } from '@langchain/langgraph';
import { SupervisorState, WorkerType } from './supervisorState';
import { supervisorNode, routeAfterSupervisor } from '../nodes/supervisorNode';
import { analystWorker } from '../nodes/workers/analystWorker';
import { architectWorker } from '../nodes/workers/architectWorker';
import { historianWorker } from '../nodes/workers/historianWorker';
import { conversationalWorker } from '../nodes/workers/conversationalWorker';
import { synthesizerNode, saveResponseNode, needsSynthesis } from '../nodes/synthesizerNode';
import { toolExecutionNode } from '../nodes/toolExecutionNode';

/**
 * Route from supervisor to appropriate worker
 */
function routeToWorker(state: typeof SupervisorState.State): string {
  const workers = state.activeWorkers || [];

  if (workers.length === 0) {
    console.log('⚠️ No workers selected, defaulting to conversational');
    return 'conversational';
  }

  // Route to first worker (for sequential processing)
  // Multi-worker parallel processing would require graph restructuring
  const primaryWorker = workers[0];
  console.log(`🔀 Routing to worker: ${primaryWorker}`);

  return primaryWorker;
}

/**
 * Route after worker completes - check if more workers or go to synthesizer
 */
function routeAfterWorker(state: typeof SupervisorState.State): string {
  const completedWorker = state.currentWorker;
  const allWorkers = state.activeWorkers || [];
  const outputs = state.workerOutputs || [];

  console.log(`📍 After worker: ${completedWorker}`);
  console.log(`   Completed: ${outputs.map((o) => o.worker).join(', ')}`);
  console.log(`   Remaining: ${allWorkers.filter((w) => !outputs.some((o) => o.worker === w)).join(', ') || 'none'}`);

  // Check if there are tool calls that need execution
  const lastOutput = outputs[outputs.length - 1];
  if (lastOutput?.toolCalls && lastOutput.toolCalls.length > 0) {
    // Filter out data-fetching tools (they were handled in worker)
    const modificationTools = lastOutput.toolCalls.filter(
      (tc: any) => !tc.name.startsWith('get_')
    );
    if (modificationTools.length > 0) {
      console.log('   → Tool execution needed');
      return 'tools';
    }
  }

  // Check if more workers need to run
  const completedWorkers = outputs.map((o) => o.worker);
  const remainingWorkers = allWorkers.filter((w) => !completedWorkers.includes(w));

  if (remainingWorkers.length > 0) {
    // Route to next worker
    const nextWorker = remainingWorkers[0];
    console.log(`   → Next worker: ${nextWorker}`);
    return nextWorker;
  }

  // All workers done - go to synthesizer
  console.log('   → All workers done, synthesizing');
  return 'synthesizer';
}

/**
 * Route after tool execution
 */
function routeAfterTools(state: typeof SupervisorState.State): string {
  // After tools, go to synthesizer
  return 'synthesizer';
}

/**
 * Create the Supervisor Workflow
 */
export function createSupervisorWorkflow() {
  const workflow = new StateGraph(SupervisorState)
    // Add all nodes
    .addNode('supervisor', supervisorNode)
    .addNode('historian', historianWorker)
    .addNode('analyst', analystWorker)
    .addNode('architect', architectWorker)
    .addNode('conversational', conversationalWorker)
    .addNode('tools', toolExecutionNode)
    .addNode('synthesizer', synthesizerNode)
    .addNode('saveResponse', saveResponseNode)

    // Start: go to supervisor
    .addEdge('__start__', 'supervisor')

    // Supervisor routes to appropriate worker
    .addConditionalEdges('supervisor', routeToWorker, {
      historian: 'historian',
      analyst: 'analyst',
      architect: 'architect',
      conversational: 'conversational',
    })

    // After each worker, check if more workers or synthesize
    .addConditionalEdges('historian', routeAfterWorker, {
      historian: 'historian',
      analyst: 'analyst',
      architect: 'architect',
      conversational: 'conversational',
      tools: 'tools',
      synthesizer: 'synthesizer',
    })
    .addConditionalEdges('analyst', routeAfterWorker, {
      historian: 'historian',
      analyst: 'analyst',
      architect: 'architect',
      conversational: 'conversational',
      tools: 'tools',
      synthesizer: 'synthesizer',
    })
    .addConditionalEdges('architect', routeAfterWorker, {
      historian: 'historian',
      analyst: 'analyst',
      architect: 'architect',
      conversational: 'conversational',
      tools: 'tools',
      synthesizer: 'synthesizer',
    })
    .addConditionalEdges('conversational', routeAfterWorker, {
      historian: 'historian',
      analyst: 'analyst',
      architect: 'architect',
      conversational: 'conversational',
      tools: 'tools',
      synthesizer: 'synthesizer',
    })

    // After tools, go to synthesizer
    .addEdge('tools', 'synthesizer')

    // Synthesizer goes to save
    .addEdge('synthesizer', 'saveResponse')

    // Save goes to end
    .addEdge('saveResponse', '__end__');

  return workflow;
}

/**
 * Estimated token savings by worker type
 */
export const TOKEN_ESTIMATES = {
  supervisor: 300,
  historian: 7000,
  analyst: 5000,
  architect: 4000,
  conversational: 2000,
  synthesizer: 500,
};

/**
 * Calculate expected tokens for a routing decision
 */
export function estimateTokensForRoute(workers: WorkerType[]): number {
  let total = TOKEN_ESTIMATES.supervisor;

  for (const worker of workers) {
    total += TOKEN_ESTIMATES[worker] || 3000;
  }

  if (workers.length > 1) {
    total += TOKEN_ESTIMATES.synthesizer;
  }

  return total;
}
