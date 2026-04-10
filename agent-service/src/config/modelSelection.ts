/**
 * Model Selection Service
 *
 * Intelligently selects the appropriate AI model based on task complexity.
 */

export type ModelTier = 'mini' | 'standard';

export interface ModelConfig {
  model: string;
  tier: ModelTier;
  costPerToken: number;
}

export const MODELS: Record<ModelTier, ModelConfig> = {
  mini: {
    model: 'gpt-4o-mini',
    tier: 'mini',
    costPerToken: 0.15, // $0.15 per 1M tokens
  },
  standard: {
    model: 'gpt-4o', // Upgraded to gpt-4o for better quality on complex analysis
    tier: 'standard',
    costPerToken: 2.50, // $2.50 per 1M tokens
  },
};

/**
 * Select model based on message complexity
 */
export function selectModelForChat(message: string, conversationLength: number): ModelConfig {
  const messageLower = message.toLowerCase();

  // Use expensive model for complex analysis
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

  const isComplex = complexPatterns.some((pattern) => pattern.test(messageLower));
  const isLongConversation = conversationLength > 10;

  if (isComplex || isLongConversation) {
    return MODELS.standard;
  }

  return MODELS.mini;
}
