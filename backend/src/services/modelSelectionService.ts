/**
 * Model Selection Service
 *
 * Intelligently selects the appropriate AI model based on task complexity.
 * Uses cheaper models (gpt-4o-mini) for simple tasks and expensive models
 * (gpt-4o) for complex analysis and modifications.
 */

export type ModelTier = 'mini' | 'standard';

export interface ModelConfig {
  model: string;
  tier: ModelTier;
  costPerToken: number; // Rough estimate in cents per 1M tokens
}

export const MODELS: Record<ModelTier, ModelConfig> = {
  mini: {
    model: 'gpt-4o-mini',
    tier: 'mini',
    costPerToken: 0.15, // Very cheap for simple tasks
  },
  standard: {
    model: 'gpt-4o',
    tier: 'standard',
    costPerToken: 5.0, // More expensive but better reasoning
  },
};

/**
 * Determine which model to use based on task complexity
 */
export function selectModelForChat(message: string, conversationLength: number): ModelConfig {
  const messageLower = message.toLowerCase();

  // Use expensive model for complex analysis requests
  const complexPatterns = [
    /analyz(e|ing)/i,
    /performance/i,
    /progression/i,
    /training plan/i,
    /modify.*workout/i,
    /adjust.*plan/i,
    /change.*workout/i,
    /shift.*workout/i,
    /create.*workout/i,
    /delete.*workout/i,
    /recommend.*change/i,
    /should i/i,
    /what.*think/i,
    /how.*look/i,
    /pace strategy/i,
    /heart rate zone/i,
    /overtraining/i,
    /recovery/i,
    /fatigue/i,
    /injury/i,
  ];

  const isComplex = complexPatterns.some(pattern => pattern.test(messageLower));

  // Long conversations benefit from better context understanding
  const isLongConversation = conversationLength > 10;

  // Use standard model for complex queries or long conversations
  if (isComplex || isLongConversation) {
    return MODELS.standard;
  }

  // Use mini model for simple queries
  return MODELS.mini;
}

/**
 * Always use standard model for tool calls
 * Tool calling requires better reasoning and reliability
 */
export function selectModelForToolCalling(): ModelConfig {
  return MODELS.standard;
}

/**
 * Select model for weekly analysis (always standard)
 */
export function selectModelForWeeklyAnalysis(): ModelConfig {
  return MODELS.standard;
}

/**
 * Select model for read-only analysis tool
 * Simple analysis can use mini, complex analysis uses standard
 */
export function selectModelForAnalysis(focusArea: string): ModelConfig {
  const complexFocusAreas = ['progression', 'recovery', 'overall'];

  if (complexFocusAreas.includes(focusArea)) {
    return MODELS.standard;
  }

  return MODELS.mini;
}

/**
 * Override model selection for specific user preferences
 * (could be used for premium users in the future)
 */
export function applyUserModelPreference(
  baseModel: ModelConfig,
  userTier?: 'free' | 'premium'
): ModelConfig {
  // Premium users always get standard model
  if (userTier === 'premium') {
    return MODELS.standard;
  }

  return baseModel;
}

/**
 * Estimate token cost for a request (rough approximation)
 */
export function estimateTokenCost(
  promptTokens: number,
  completionTokens: number,
  model: ModelConfig
): number {
  // Cost per 1M tokens, convert to cents
  const promptCost = (promptTokens / 1_000_000) * model.costPerToken * 100;
  const completionCost = (completionTokens / 1_000_000) * model.costPerToken * 100;

  return promptCost + completionCost;
}
