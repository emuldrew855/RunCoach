/**
 * Supervisor Node
 *
 * The orchestrator in the multi-agent architecture.
 * Receives user query + minimal metadata, then delegates to specialized workers.
 *
 * Responsibilities:
 * 1. Use LLM Router to classify intent
 * 2. Select appropriate worker(s)
 * 3. Determine context tier needed
 * 4. Route to selected worker(s)
 *
 * Uses gpt-4o-mini for cost-effective routing (~$0.0001 per classification)
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  SupervisorStateType,
  RoutingDecision,
  WorkerType,
} from '../workflow/supervisorState';
import { getLLMRouter, mapToLegacyIntent } from '../router/llmRouter';
import { backendClient } from '../../api/backendClient';

/**
 * Supervisor Node - Routes queries to specialized workers
 */
export async function supervisorNode(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n🎯 ========== SUPERVISOR NODE ==========');
  console.log(`User Query: "${state.userQuery.substring(0, 100)}..."`);
  console.log(`User ID: ${state.userId}`);
  console.log(`Conversation ID: ${state.conversationId}`);

  try {
    // Step 1: Classify intent using LLM Router
    const router = getLLMRouter();
    const routingDecision = await router.classify(state.userQuery);

    console.log('\n📊 Routing Decision:');
    console.log(`   Intent: ${routingDecision.intent}`);
    console.log(`   Confidence: ${(routingDecision.confidence * 100).toFixed(0)}%`);
    console.log(`   Context Tier: ${routingDecision.contextTier}`);
    console.log(`   Workers: [${routingDecision.suggestedWorkers.join(', ')}]`);
    console.log(`   Reasoning: ${routingDecision.reasoning}`);

    // Step 2: Load core context (always needed, ~1k tokens)
    console.log('\n📦 Loading CORE context...');
    const coreContext = await backendClient.getCoreContext(state.userId);

    // Step 3: Prepare initial messages with system context
    const systemMessage = buildSupervisorSystemMessage(coreContext, routingDecision);
    const humanMessage = new HumanMessage(state.userQuery);

    console.log('\n✅ Supervisor routing complete');
    console.log('=========================================\n');

    return {
      routingDecision,
      activeWorkers: routingDecision.suggestedWorkers,
      contextTiers: {
        core: coreContext,
        active: null,
        deep: null,
      },
      messages: [systemMessage, humanMessage],
      stepCount: state.stepCount + 1,
      modelUsed: {
        ...state.modelUsed,
        supervisor: 'gpt-4o-mini',
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error) || 'Unknown error';
    console.error('❌ Supervisor Node Error:', errorMessage);

    // Fallback to conversational worker on error
    return {
      routingDecision: {
        intent: 'general',
        confidence: 0.5,
        reasoning: 'Fallback due to routing error',
        contextTier: 'core',
        suggestedWorkers: ['conversational'],
      },
      activeWorkers: ['conversational'],
      contextTiers: {
        core: null,
        active: null,
        deep: null,
      },
      messages: [new HumanMessage(state.userQuery)],
      stepCount: state.stepCount + 1,
      error: `Supervisor error: ${errorMessage}`,
    };
  }
}

/**
 * Build minimal system message for supervisor
 * Just enough context to guide workers
 */
function buildSupervisorSystemMessage(
  coreContext: any,
  routingDecision: RoutingDecision
): SystemMessage {
  const content = `You are a running coach AI assistant for ${coreContext.firstName}.

ATHLETE PROFILE:
- Goal: ${coreContext.goalType || 'General fitness'}${coreContext.goalDate ? ` on ${coreContext.goalDate}` : ''}
- Target Pace: ${coreContext.goalPace || 'Not set'}
- Training Phase: ${coreContext.trainingPhase || 'Unknown'}
- Weeks Remaining: ${coreContext.weeksRemaining || 'N/A'}
- Experience: ${coreContext.experienceYears || 'Unknown'} years
- Coach Style: ${coreContext.coachStyle}

ROUTING INFO:
- Detected Intent: ${routingDecision.intent}
- Context Tier: ${routingDecision.contextTier}
- Active Workers: ${routingDecision.suggestedWorkers.join(', ')}

This context will be expanded by the appropriate worker(s).`;

  return new SystemMessage(content);
}

/**
 * Route after supervisor - determines which worker(s) to invoke
 */
export function routeAfterSupervisor(state: SupervisorStateType): string {
  const workers = state.activeWorkers || [];

  if (workers.length === 0) {
    console.log('⚠️ No workers selected, defaulting to conversational');
    return 'conversational';
  }

  // For now, route to the first worker
  // Multi-worker routing will be handled by parallel invocation later
  const primaryWorker = workers[0];

  console.log(`🔀 Routing to worker: ${primaryWorker}`);

  switch (primaryWorker) {
    case 'historian':
      return 'historian';
    case 'analyst':
      return 'analyst';
    case 'architect':
      return 'architect';
    case 'conversational':
    default:
      return 'conversational';
  }
}

/**
 * Check if multiple workers are needed
 */
export function needsMultipleWorkers(state: SupervisorStateType): boolean {
  return (state.activeWorkers?.length || 0) > 1;
}

/**
 * Get legacy intent for backwards compatibility
 */
export function getLegacyIntent(state: SupervisorStateType): string {
  if (!state.routingDecision) return 'general_chat';
  return mapToLegacyIntent(state.routingDecision);
}
