/**
 * Intent Classifier
 *
 * Classifies user messages into intent categories to route to specialized agents
 * and load only relevant context.
 *
 * Intent Categories:
 * - run_analysis: Analyze specific completed activities
 * - plan_review: Review and modify training plan
 * - progress_tracking: Track progress over time periods
 * - general_chat: General questions, motivation, quick advice
 */

export type Intent =
  | 'run_analysis'
  | 'plan_review'
  | 'progress_tracking'
  | 'general_chat';

export interface IntentResult {
  intent: Intent;
  confidence: number; // 0-1
  matchedPatterns: string[];
}

/**
 * Pattern definitions for each intent
 */
const INTENT_PATTERNS = {
  run_analysis: {
    keywords: [
      'analyze', 'analysis', 'how was', 'how did', 'what do you think about',
      'yesterday', 'today', 'this morning', 'last night', 'recent run',
      'my run', 'my workout', 'tempo run', 'long run', 'interval',
      'pace', 'splits', 'heart rate', 'execution', 'performance on'
    ],
    phrases: [
      /how (was|did).*run/i,
      /analyze.*run/i,
      /analyze.*workout/i,
      /what.*think.*run/i,
      /yesterday'?s (run|workout)/i,
      /today'?s (run|workout)/i,
      /last.*run/i,
      /recent run/i,
      /did i (run|pace) (well|correctly|good)/i,
      /(good|bad) run/i,
    ],
    exclusions: [
      /next/i,
      /upcoming/i,
      /plan/i,
      /schedule/i,
      /week/i,
      /modify/i,
      /change/i,
    ]
  },

  plan_review: {
    keywords: [
      'plan', 'schedule', 'next week', 'upcoming', 'training plan',
      'modify', 'change', 'adjust', 'move', 'shift', 'add workout',
      'delete workout', 'remove workout', 'create workout',
      'review my plan', 'look at my plan', 'is my plan',
      'would you change', 'should i change', 'recommendations for',
      'planned week', 'planned workouts', 'plan structure', 'workout distribution',
      'planned training', 'scheduled workouts'
    ],
    phrases: [
      /review.*plan/i,
      /review.*(next|upcoming)/i,
      /look at.*plan/i,
      /is my plan (good|adequate|okay)/i,
      /would you (make|suggest).*change/i,
      /should i change.*plan/i,
      /modify.*workout/i,
      /change.*workout/i,
      /move.*(run|workout)/i,
      /shift.*(run|workout)/i,
      /add.*workout/i,
      /delete.*workout/i,
      /next week'?s/i,
      /upcoming week/i,
      /(long|tempo|easy|interval) run.*(next|upcoming|scheduled)/i,
      /analyze.*planned (week|workouts)/i,
      /review.*planned (week|workouts|training)/i,
      /look at.*(planned|my scheduled)/i,
      /(what|how).*(think|look).*training (week|plan)/i,
      /planned workout.*balance/i,
      /week.*planned/i,
      /planned.*training.*week/i,
      /don'?t.*focus.*(on )?(completed|done|finished)/i, // "don't focus on completed" = wants plan review
      /review.*(my|the).*training/i,
      /analyze.*(my|the).*(upcoming|scheduled|planned)/i,
    ],
    exclusions: [
      /how'?s.*week going/i, // Progress check, not plan review
      // Note: Removed /completed/i, /actual/i, /progress/i, /adherence/i
      // These can appear in plan review context (e.g., "don't focus on completed")
    ]
  },

  progress_tracking: {
    keywords: [
      'progress', 'this week', 'last week', 'this month', 'adherence',
      'on track', 'how am i doing', "how's my week", 'weekly analysis',
      'monthly summary', 'consistency', 'volume', 'mileage',
      'total distance', 'training load', 'completed workouts',
      'what did i do', 'what have i done'
    ],
    phrases: [
      /how'?s? (my|this) week/i,
      /weekly (analysis|progress|summary)/i, // Removed 'review' - too ambiguous
      /monthly (analysis|progress|summary)/i,
      /am i on track/i,
      /how am i doing/i,
      /my progress/i,
      /adherence rate/i,
      /(this|last) week'?s? (progress|summary)/i,
      /total (distance|mileage|volume)/i,
      /training load/i,
      /what (did i|have i) (do|complete|run)/i,
      /how much (did i|have i) run/i,
    ],
    exclusions: [
      /planned/i,        // User asking about planned = plan_review
      /upcoming/i,       // Forward-looking = plan_review
      /next week/i,      // Future timeframe = plan_review
      /schedule/i,       // Planning context = plan_review
      /modify/i,         // Action-oriented = plan_review
      /change/i,         // Action-oriented = plan_review
      /adjust/i,         // Action-oriented = plan_review
      /don'?t.*focus.*(completed|done)/i, // Explicitly rejecting completed focus
    ]
  },

  general_chat: {
    // Fallback - everything else
    keywords: [
      'should i', 'what if', 'how do i', 'tell me about',
      'explain', 'what is', 'motivation', 'advice',
      'nutrition', 'recovery', 'injury', 'race strategy'
    ],
    phrases: [
      /should i run/i,
      /what (should|can) i/i,
      /tell me about/i,
      /explain/i,
      /what is/i,
      /give me.*motivation/i,
      /any (advice|tips)/i,
    ],
    exclusions: []
  }
};

/**
 * Classify user intent based on message content
 */
export function classifyIntent(message: string): IntentResult {
  const messageLower = message.toLowerCase();
  const scores: Record<Intent, { score: number; matches: string[] }> = {
    run_analysis: { score: 0, matches: [] },
    plan_review: { score: 0, matches: [] },
    progress_tracking: { score: 0, matches: [] },
    general_chat: { score: 0, matches: [] },
  };

  // Check each intent's patterns
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const intentKey = intent as Intent;

    // Check exclusions first - if matched, skip this intent
    if (patterns.exclusions.length > 0) {
      const hasExclusion = patterns.exclusions.some(pattern => pattern.test(message));
      if (hasExclusion) {
        continue;
      }
    }

    // Check keywords (each match = +1 point)
    for (const keyword of patterns.keywords) {
      if (messageLower.includes(keyword)) {
        scores[intentKey].score += 1;
        scores[intentKey].matches.push(`keyword:${keyword}`);
      }
    }

    // Check phrase patterns (each match = +3 points, more specific)
    for (const pattern of patterns.phrases) {
      if (pattern.test(message)) {
        scores[intentKey].score += 3;
        scores[intentKey].matches.push(`phrase:${pattern.source}`);
      }
    }
  }

  // Determine winner
  const intents = Object.keys(scores) as Intent[];
  let winningIntent: Intent = 'general_chat'; // Default fallback
  let maxScore = 0;

  for (const intent of intents) {
    if (scores[intent].score > maxScore) {
      maxScore = scores[intent].score;
      winningIntent = intent;
    }
  }

  // Calculate confidence (normalized score)
  const totalPossibleScore = Math.max(
    ...Object.values(scores).map(s => s.score)
  );
  const confidence = totalPossibleScore > 0
    ? maxScore / (totalPossibleScore + 2) // Add 2 to prevent 100% confidence
    : 0.3; // Low confidence for no matches

  return {
    intent: winningIntent,
    confidence: Math.min(confidence, 0.95), // Cap at 95%
    matchedPatterns: scores[winningIntent].matches,
  };
}

/**
 * Get human-readable description of intent
 */
export function getIntentDescription(intent: Intent): string {
  const descriptions: Record<Intent, string> = {
    run_analysis: 'Analyzing specific completed activity',
    plan_review: 'Reviewing and modifying training plan',
    progress_tracking: 'Tracking progress over time period',
    general_chat: 'General coaching conversation',
  };
  return descriptions[intent];
}

/**
 * Get expected context size for intent (in tokens)
 */
export function getExpectedContextSize(intent: Intent): number {
  const sizes: Record<Intent, number> = {
    run_analysis: 8000,
    plan_review: 15000,
    progress_tracking: 12000,
    general_chat: 5000,
  };
  return sizes[intent];
}

/**
 * Test function for debugging
 */
export function testIntentClassifier() {
  const testCases = [
    // Run Analysis
    { message: "How was my run yesterday?", expected: "run_analysis" },
    { message: "Analyze my tempo run from Tuesday", expected: "run_analysis" },

    // Plan Review - standard cases
    { message: "Review next week's training plan", expected: "plan_review" },
    { message: "Would you make any changes to my plan?", expected: "plan_review" },
    { message: "Move my long run to Friday", expected: "plan_review" },

    // Plan Review - edge cases (critical fix)
    { message: "Review my planned training week, don't focus on completed workouts", expected: "plan_review" },
    { message: "Analyze my upcoming schedule", expected: "plan_review" },
    { message: "Review my planned workouts for next week", expected: "plan_review" },
    { message: "Is my training plan structured well?", expected: "plan_review" },

    // Progress Tracking
    { message: "How's my week going?", expected: "progress_tracking" },
    { message: "What did I complete this week?", expected: "progress_tracking" },
    { message: "Am I on track for my marathon?", expected: "progress_tracking" },
    { message: "How much mileage did I run last week?", expected: "progress_tracking" },

    // General Chat
    { message: "Should I run today?", expected: "general_chat" },
    { message: "Tell me about negative splits", expected: "general_chat" },
    { message: "Give me some motivation", expected: "general_chat" },
  ];

  console.log('\n🧪 Intent Classifier Test Results:\n');
  let correct = 0;
  let total = testCases.length;

  for (const testCase of testCases) {
    const result = classifyIntent(testCase.message);
    const isCorrect = result.intent === testCase.expected;
    if (isCorrect) correct++;

    console.log(`${isCorrect ? '✅' : '❌'} "${testCase.message}"`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Got: ${result.intent} (${(result.confidence * 100).toFixed(0)}% confidence)`);
    if (result.matchedPatterns.length > 0) {
      console.log(`   Matched: ${result.matchedPatterns.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  console.log(`📊 Accuracy: ${correct}/${total} (${((correct/total) * 100).toFixed(0)}%)\n`);
}
