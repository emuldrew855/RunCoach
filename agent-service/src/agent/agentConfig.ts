/**
 * Agent Configuration System
 *
 * Defines specialized agent configurations for each intent type.
 * Each agent has:
 * - Tailored system prompt (via promptBuilder)
 * - Specific tool access (read-only agents have no tools)
 * - Configured parameters (temperature, maxTokens)
 *
 * Part of Phase 2: Multi-Agent Architecture
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { Intent } from '../utils/intentClassifier';
import { UserContextData } from '../types';
import {
  buildRunAnalysisPrompt,
  buildPlanReviewPrompt,
  buildProgressPrompt,
  buildConversationalPrompt,
} from '../config/specializedPrompts';

/**
 * Agent Configuration Interface
 *
 * Defines the structure for each specialized agent
 */
export interface AgentConfig {
  /** Human-readable agent name */
  name: string;

  /** Intent this agent handles */
  intent: Intent;

  /** Prompt builder function - generates specialized system prompt */
  promptBuilder: (userData: UserContextData) => string;

  /** Tools available to this agent (empty array for read-only agents) */
  tools: DynamicStructuredTool<any>[];

  /** Maximum tokens for agent response */
  maxTokens: number;

  /** Temperature for response generation (0-1) */
  temperature: number;

  /** Description of agent's role */
  description: string;
}

/**
 * Agent Configuration Registry
 *
 * Maps each intent to its specialized agent configuration.
 * Tools will be injected when creating the agent instance.
 */
export const AGENT_CONFIGS: Record<Intent, Omit<AgentConfig, 'tools'>> = {
  /**
   * Run Analysis Agent
   *
   * Role: Performance analysis expert focused on individual completed activities
   * Personality: Analytical, detail-oriented, data-driven
   * Tools: ALL (can suggest plan modifications based on run analysis)
   * Architecture: Two-pass (Analysis → Execution)
   */
  run_analysis: {
    name: 'RunAnalysisAgent',
    intent: 'run_analysis',
    promptBuilder: buildRunAnalysisPrompt,
    maxTokens: 2000,
    temperature: 0.7,
    description: 'Performance analysis expert - analyzes completed runs and suggests plan adjustments',
  },

  /**
   * Plan Review Agent
   *
   * Role: Strategic training plan analyst and modification specialist
   * Personality: Critical, strategic, evidence-based, proactive
   * Tools: ALL (shift, modify, create, delete, bulk_modify)
   * Prompt: ~12k tokens (vs 15k generic) - 20% reduction
   */
  plan_review: {
    name: 'PlanReviewAgent',
    intent: 'plan_review',
    promptBuilder: buildPlanReviewPrompt,
    maxTokens: 2000,
    temperature: 0.7,
    description: 'Strategic planner - reviews and modifies training plans with critical analysis',
  },

  /**
   * Progress Tracking Agent
   *
   * Role: Training progress and trend analyst
   * Personality: Objective, trend-focused, motivational with data
   * Tools: NONE (read-only)
   * Prompt: ~6k tokens (vs 15k generic) - 60% reduction
   */
  progress_tracking: {
    name: 'ProgressAgent',
    intent: 'progress_tracking',
    promptBuilder: buildProgressPrompt,
    maxTokens: 2000,
    temperature: 0.7,
    description: 'Trend analyzer - tracks progress over time with adherence and volume analysis',
  },

  /**
   * Conversational Agent
   *
   * Role: Supportive running coach for general questions
   * Personality: Warm, encouraging, educational, accessible
   * Tools: NONE
   * Prompt: ~4k tokens (vs 15k generic) - 73% reduction
   */
  general_chat: {
    name: 'ConversationalAgent',
    intent: 'general_chat',
    promptBuilder: buildConversationalPrompt,
    maxTokens: 2000,
    temperature: 0.8, // Slightly higher for more natural conversation
    description: 'Supportive coach - provides motivation, education, and general running advice',
  },
};

/**
 * Get Agent Configuration for Intent
 *
 * Returns the specialized agent configuration for a given intent,
 * with tools injected based on agent capabilities.
 *
 * @param intent - The classified user intent
 * @param allTools - All available tools (will be filtered based on agent config)
 * @returns Complete agent configuration with appropriate tools
 */
export function getAgentConfig(
  intent: Intent,
  allTools: {
    shiftWorkoutTool: DynamicStructuredTool<any>;
    modifyWorkoutTool: DynamicStructuredTool<any>;
    createWorkoutTool: DynamicStructuredTool<any>;
    deleteWorkoutTool: DynamicStructuredTool<any>;
    bulkModifyWorkoutsTool: DynamicStructuredTool<any>;
    swapTrainingWeeksTool: DynamicStructuredTool<any>;
    approvePlanTool?: DynamicStructuredTool<any>;
  }
): AgentConfig {
  const baseConfig = AGENT_CONFIGS[intent] || AGENT_CONFIGS.general_chat;

  // Determine which tools this agent should have access to
  let tools: DynamicStructuredTool<any>[] = [];

  if (intent === 'plan_review' || intent === 'progress_tracking' || intent === 'run_analysis') {
    // All coaching agents get tools for the two-pass architecture:
    // - plan_review: Review and modify upcoming workouts
    // - progress_tracking: Analyze weekly progress and suggest adjustments
    // - run_analysis: Analyze completed runs and suggest plan adjustments
    tools = [
      allTools.shiftWorkoutTool,
      allTools.modifyWorkoutTool,
      allTools.createWorkoutTool,
      allTools.deleteWorkoutTool,
      allTools.bulkModifyWorkoutsTool,
      allTools.swapTrainingWeeksTool,
    ];
    // Add approve_plan tool if available
    if (allTools.approvePlanTool) {
      tools.push(allTools.approvePlanTool);
    }
  }
  // general_chat agent is read-only (no tools)

  return {
    ...baseConfig,
    tools,
  };
}

/**
 * Log Agent Selection
 *
 * Helper function to log which agent was selected and why
 */
export function logAgentSelection(intent: Intent, confidence: number): void {
  const config = AGENT_CONFIGS[intent];
  const confidencePercent = (confidence * 100).toFixed(0);

  console.log(`🤖 Selected agent: ${config.name}`);
  console.log(`   Intent: ${intent} (${confidencePercent}% confidence)`);
  console.log(`   Role: ${config.description}`);
  console.log(`   Tools: ${(intent === 'plan_review' || intent === 'progress_tracking' || intent === 'run_analysis') ? 'ALL (7 tools)' : 'NONE (read-only)'}`);
  console.log(`   Prompt size: ~${getPromptSizeEstimate(intent)} tokens`);
}

/**
 * Get estimated prompt size for logging
 */
function getPromptSizeEstimate(intent: Intent): string {
  const estimates: Record<Intent, string> = {
    run_analysis: '5,000',
    plan_review: '12,000',
    progress_tracking: '6,000',
    general_chat: '4,000',
  };
  return estimates[intent];
}

/**
 * Validate Agent Configuration
 *
 * Ensures all agent configurations are properly set up
 * Call this at startup to catch configuration errors early
 */
export function validateAgentConfigs(): void {
  const requiredIntents: Intent[] = ['run_analysis', 'plan_review', 'progress_tracking', 'general_chat'];

  for (const intent of requiredIntents) {
    const config = AGENT_CONFIGS[intent];
    if (!config) {
      throw new Error(`Missing agent configuration for intent: ${intent}`);
    }
    if (!config.promptBuilder) {
      throw new Error(`Missing promptBuilder for agent: ${intent}`);
    }
    if (!config.name || !config.description) {
      throw new Error(`Missing metadata for agent: ${intent}`);
    }
  }

  console.log('✅ All agent configurations validated');
}
