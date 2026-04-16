/**
 * Supervisor State Schema
 *
 * State definition for the Orchestrator-Worker multi-agent architecture.
 * Replaces monolithic context loading with JIT (Just-In-Time) data fetching.
 *
 * Architecture:
 *   User Message → SUPERVISOR (routes) → WORKERS (specialized) → SYNTHESIZER → Response
 *
 * Workers:
 *   - HISTORIAN: RAG, historical summaries, long-term trends
 *   - ANALYST: Recent activities, HR zones, performance analysis
 *   - ARCHITECT: Training plan, workout modifications (preserves two-pass)
 *   - CONVERSATIONAL: General questions, motivation, advice
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

// ============================================
// Worker Types
// ============================================

export type WorkerType = 'historian' | 'analyst' | 'architect' | 'conversational';

export type IntentType = 'historian' | 'analyst' | 'architect' | 'general';

export type ContextTierType = 'core' | 'active' | 'deep';

// ============================================
// Routing Decision (from LLM Router)
// ============================================

export interface RoutingDecision {
  intent: IntentType;
  confidence: number;
  reasoning: string;
  contextTier: ContextTierType;
  suggestedWorkers: WorkerType[];
}

// ============================================
// Worker Output
// ============================================

export interface ToolCall {
  name: string;
  args: Record<string, any>;
  id: string;
}

export interface PendingAction {
  action_type: string;
  action_payload: Record<string, any>;
  agent_reasoning: string;
}

export interface WorkerOutput {
  worker: WorkerType;
  content: string;
  toolCalls?: ToolCall[];
  pendingActions?: PendingAction[];
  tokensUsed: number;
  modelUsed: string;
}

// ============================================
// Tiered Context Structures
// ============================================

/**
 * Core Context (~1k tokens)
 * Always loaded - minimal user profile and goal info
 */
export interface CoreContext {
  firstName: string;
  lastName: string;
  goalType: string | null;
  goalDate: string | null;
  goalPace: string | null;
  trainingPhase: string | null;
  weeksRemaining: number | null;
  coachStyle: string;
  experienceYears: number | null;
  preferredUnits: 'metric' | 'imperial';
}

/**
 * Active Context (~3k tokens)
 * Current week data - loaded by default for most queries
 */
export interface ActiveContext {
  thisWeekWorkouts: WorkoutSummary[];
  lastTwoRuns: ActivitySummary[];
  currentAdherence: {
    planned: number;
    completed: number;
    adherenceRate: number;
  };
  hrZones: {
    zone1Max: number;
    zone2Max: number;
    zone3Max: number;
    zone4Max: number;
    zone5Max: number;
  } | null;
  upcomingWorkoutCount: number;
}

/**
 * Deep Context (~15k+ tokens)
 * Historical data - only loaded for review/progress queries
 */
export interface DeepContext {
  thirtyDayActivities: ActivitySummary[];
  ragResults: RAGResult[];
  fourWeekPlan: WorkoutSummary[];
  longTermMemories: MemorySummary[];
  weeklyInsights: WeeklyInsight[];
  runnerTendencies: any[];
}

export interface WorkoutSummary {
  id: number;
  scheduledDate: string;
  workoutType: string;
  name: string | null;
  targetDistanceMeters: number | null;
  targetPaceAvg: number | null;
  targetHrZone: number | null;
  completionStatus: 'pending' | 'completed' | 'skipped';
  completedActivityId: number | null;
}

export interface ActivitySummary {
  id: number;
  startDate: string;
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averagePace: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  hrZoneDistribution?: {
    zone1Percent: number;
    zone2Percent: number;
    zone3Percent: number;
    zone4Percent: number;
    zone5Percent: number;
  };
}

export interface RAGResult {
  type: string;
  content: string;
  relevance: number;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface MemorySummary {
  type: string;
  content: string;
  relevance: number;
  timestamp: string;
}

export interface WeeklyInsight {
  weekStart: string;
  totalDistanceKm: number;
  avgPace: number | null;
  adherenceRate: number;
  keyInsights: string[];
}

// ============================================
// Context Tiers Container
// ============================================

export interface ContextTiers {
  core: CoreContext | null;
  active: ActiveContext | null;
  deep: DeepContext | null;
}

// ============================================
// Token Usage Tracking
// ============================================

export interface TokenUsageByWorker {
  supervisor?: { prompt: number; completion: number; total: number };
  historian?: { prompt: number; completion: number; total: number };
  analyst?: { prompt: number; completion: number; total: number };
  architect?: { prompt: number; completion: number; total: number };
  conversational?: { prompt: number; completion: number; total: number };
  synthesizer?: { prompt: number; completion: number; total: number };
  total: { prompt: number; completion: number; total: number };
}

// ============================================
// Supervisor State Definition
// ============================================

/**
 * Create a custom reducer for worker outputs
 *
 * CRITICAL: Empty array means RESET (new message starting).
 * This prevents context bleeding between messages in the same conversation.
 *
 * - next = [] → RESET (new message, clear old outputs)
 * - next = undefined → KEEP prev (no update)
 * - next = [data] → ACCUMULATE within same message chain
 */
function workerOutputsReducer(
  prev: WorkerOutput[] | undefined,
  next: WorkerOutput[] | undefined
): WorkerOutput[] {
  // Empty array is explicit RESET signal (new message starting)
  if (Array.isArray(next) && next.length === 0) {
    return [];
  }
  // Undefined/null means no update - keep previous
  if (next === undefined || next === null) {
    return prev || [];
  }
  // Has content - accumulate within the current message's worker chain
  return [...(prev || []), ...next];
}

/**
 * Create a custom reducer for pending actions
 * Same reset logic as workerOutputs
 */
function pendingActionsReducer(
  prev: PendingAction[] | undefined,
  next: PendingAction[] | undefined
): PendingAction[] {
  // Empty array is explicit RESET signal
  if (Array.isArray(next) && next.length === 0) {
    return [];
  }
  // Undefined/null means no update
  if (next === undefined || next === null) {
    return prev || [];
  }
  // Has content - accumulate within current message
  return [...(prev || []), ...next];
}

/**
 * SupervisorState - Main state schema for multi-agent architecture
 */
export const SupervisorState = Annotation.Root({
  // Core message handling (same as before)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
  }),

  // User identification
  userId: Annotation<number>,
  conversationId: Annotation<string>,
  userQuery: Annotation<string>,

  // Supervisor routing decisions
  routingDecision: Annotation<RoutingDecision | null>,
  activeWorkers: Annotation<WorkerType[]>,

  // Worker outputs (accumulated across workers)
  workerOutputs: Annotation<WorkerOutput[]>({
    reducer: workerOutputsReducer,
  }),

  // JIT Context tracking (loaded on-demand)
  contextTiers: Annotation<ContextTiers>,

  // Execution tracking
  stepCount: Annotation<number>,
  currentWorker: Annotation<WorkerType | null>,

  // Model and token tracking
  modelUsed: Annotation<Record<string, string>>,
  tokenUsage: Annotation<TokenUsageByWorker>,

  // Two-pass architecture compatibility (for Architect worker)
  analysisResult: Annotation<string | null>,
  analysisVerdict: Annotation<string | null>,

  // Pending actions (accumulated across workers)
  pendingActions: Annotation<PendingAction[]>({
    reducer: pendingActionsReducer,
  }),

  // Error handling
  error: Annotation<string | null>,
});

// Export state type for use in nodes
export type SupervisorStateType = typeof SupervisorState.State;

// ============================================
// Initial State Factory
// ============================================

export function createInitialSupervisorState(
  userId: number,
  conversationId: string,
  userQuery: string
): Partial<SupervisorStateType> {
  return {
    userId,
    conversationId,
    userQuery,
    messages: [],
    routingDecision: null,
    activeWorkers: [],
    workerOutputs: [],
    contextTiers: {
      core: null,
      active: null,
      deep: null,
    },
    stepCount: 0,
    currentWorker: null,
    modelUsed: {},
    tokenUsage: {
      total: { prompt: 0, completion: 0, total: 0 },
    },
    analysisResult: null,
    analysisVerdict: null,
    pendingActions: [],
    error: null,
  };
}

// ============================================
// State Helpers
// ============================================

/**
 * Check if a context tier is loaded
 */
export function isContextTierLoaded(
  tiers: ContextTiers,
  tier: ContextTierType
): boolean {
  return tiers[tier] !== null;
}

/**
 * Get total tokens used across all workers
 */
export function getTotalTokensUsed(usage: TokenUsageByWorker): number {
  return usage.total.total;
}

/**
 * Merge pending actions from worker outputs
 */
export function extractPendingActionsFromOutputs(
  outputs: WorkerOutput[]
): PendingAction[] {
  return outputs.flatMap((output) => output.pendingActions || []);
}
