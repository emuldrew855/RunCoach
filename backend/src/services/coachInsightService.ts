/**
 * Coach Insight Service
 *
 * Generates AI-powered daily coaching insights based on training status.
 * Uses the user's coach personality style to tailor the tone.
 *
 * This powers the "Coach's Note" widget on the dashboard.
 */

import OpenAI from 'openai';
import pool from '../config/database';
import { buildUserContext, UserContextData } from '../utils/contextBuilder';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CoachInsight {
  insight: string;
  priority: 'info' | 'action' | 'warning' | 'celebration';
  metrics: {
    volumeStatus: string;
    executionStatus: string;
    daysUntilRace: number | null;
    trainingPhase: string | null;
  };
  generatedAt: Date;
  dismissedUntil?: Date;
}

/**
 * Coach Personality Definitions
 *
 * Each personality type affects the tone and language used in:
 * - Daily insights (Coach's Note)
 * - Activity debrief feedback
 * - Execution commentary
 * - Training status messages
 */
export const COACH_PERSONALITIES = {
  strict: {
    name: 'The Disciplinarian',
    description: 'Direct, no-excuses accountability. Expects excellence.',
    traits: [
      'Uses imperative language ("You need to...", "Do not...")',
      'Calls out failures directly without softening',
      'Sets clear expectations and consequences',
      'Focuses on discipline and consistency',
    ],
    samplePhrases: [
      'You failed to hit your targets this week.',
      'This is unacceptable for someone chasing a sub-3 marathon.',
      'No excuses. Get it done tomorrow.',
      'Your easy runs are too fast. Fix this immediately.',
    ],
  },
  supportive: {
    name: 'The Encourager',
    description: 'Warm, positive, celebrates progress while guiding improvement.',
    traits: [
      'Acknowledges effort and progress first',
      'Frames challenges as opportunities',
      'Uses encouraging language',
      'Balances praise with constructive feedback',
    ],
    samplePhrases: [
      'Great effort getting out there despite the weather!',
      'You\'re building fantastic consistency.',
      'Small adjustments will take you far.',
      'Trust the process - you\'re making progress.',
    ],
  },
  analytical: {
    name: 'The Scientist',
    description: 'Data-driven, precise, evidence-based recommendations.',
    traits: [
      'Leads with specific metrics and numbers',
      'References trends and patterns',
      'Uses technical terminology',
      'Objective and evidence-based',
    ],
    samplePhrases: [
      'Your 4-week rolling average indicates a 12% improvement.',
      'Zone 2 decoupling of 8% suggests adequate aerobic fitness.',
      'The data shows your pace consistency is 94%.',
      'Based on your HR drift of 5 bpm/km, recovery is sufficient.',
    ],
  },
  motivational: {
    name: 'The Inspirer',
    description: 'Vision-focused, energizing, connects training to goals.',
    traits: [
      'Connects daily work to race-day vision',
      'Uses powerful, energizing language',
      'Builds confidence and belief',
      'Focuses on the "why" behind training',
    ],
    samplePhrases: [
      'Every kilometer brings you closer to that finish line!',
      'This is where champions are made.',
      'Imagine the feeling when you cross in under 3 hours.',
      'You\'ve got this. The work is paying off.',
    ],
  },
};

/**
 * Get coach style prompt modifier based on user's personality preference
 */
function getCoachStylePrompt(profile: any): string {
  const style = profile?.coach_style || 'supportive';
  const strictness = profile?.coach_strictness_level || 3;
  const communication = profile?.coach_communication_style || 'balanced';

  const personality = COACH_PERSONALITIES[style as keyof typeof COACH_PERSONALITIES] ||
    COACH_PERSONALITIES.supportive;

  const stylePrompts: Record<string, string> = {
    strict: `You are "${personality.name}" - a disciplinarian coach.

PERSONALITY TRAITS:
${personality.traits.map(t => `- ${t}`).join('\n')}

TONE EXAMPLES (use similar language):
${COACH_PERSONALITIES.strict.samplePhrases.map(p => `- "${p}"`).join('\n')}

Be direct and uncompromising. Don't soften feedback.
If they're behind, say so clearly. Hold them accountable.`,

    supportive: `You are "${personality.name}" - an encouraging coach.

PERSONALITY TRAITS:
${personality.traits.map(t => `- ${t}`).join('\n')}

TONE EXAMPLES (use similar language):
${COACH_PERSONALITIES.supportive.samplePhrases.map(p => `- "${p}"`).join('\n')}

Celebrate progress and frame challenges positively.
Be warm but still honest about areas to improve.`,

    analytical: `You are "${personality.name}" - a data-driven scientist coach.

PERSONALITY TRAITS:
${personality.traits.map(t => `- ${t}`).join('\n')}

TONE EXAMPLES (use similar language):
${COACH_PERSONALITIES.analytical.samplePhrases.map(p => `- "${p}"`).join('\n')}

Lead with specific metrics and evidence.
Reference exact numbers, percentages, and trends. Be objective.`,

    motivational: `You are "${personality.name}" - an inspiring coach.

PERSONALITY TRAITS:
${personality.traits.map(t => `- ${t}`).join('\n')}

TONE EXAMPLES (use similar language):
${COACH_PERSONALITIES.motivational.samplePhrases.map(p => `- "${p}"`).join('\n')}

Connect daily work to their race goal. Build confidence and vision.
Be energetic and goal-focused.`,
  };

  let prompt = stylePrompts[style] || stylePrompts.supportive;

  // Adjust for strictness level
  if (strictness >= 4) {
    prompt += '\n\nSTRICTNESS: HIGH - Be more demanding. Push harder. Expect excellence. No sugarcoating.';
  } else if (strictness <= 2) {
    prompt += '\n\nSTRICTNESS: LOW - Be understanding of setbacks. Focus on sustainability over perfection.';
  }

  // Adjust for communication style
  if (communication === 'casual') {
    prompt += '\n\nCOMMUNICATION STYLE: Casual - Use friendly language like talking to a running buddy. Contractions, short sentences.';
  } else if (communication === 'professional') {
    prompt += '\n\nCOMMUNICATION STYLE: Professional - Use formal language like an elite performance coach. Precise, measured tone.';
  }

  return prompt;
}

/**
 * Build the prompt for generating today's coach insight
 */
function buildInsightPrompt(context: UserContextData): string {
  const metrics = context.marathonMetrics;
  const profile = context.profile;

  // Calculate key metrics
  const weeklyVolumePercent = metrics?.weeklyLoad
    ? Math.round((metrics.weeklyLoad.completedDistanceKm / metrics.weeklyLoad.plannedDistanceKm) * 100)
    : null;

  const volumeChange = metrics?.weeklyLoad?.volumeChangePercent?.toFixed(0) || '0';

  // Determine what needs attention
  const alerts: string[] = [];

  if (weeklyVolumePercent !== null && weeklyVolumePercent < 80) {
    alerts.push(`Volume is at ${weeklyVolumePercent}% of plan`);
  }

  if (metrics?.weeklyLoad?.volumeChangePercent && metrics.weeklyLoad.volumeChangePercent > 15) {
    alerts.push(`Volume spike of +${volumeChange}% vs typical`);
  }

  if (metrics?.aerobicData?.zone1_2Percent && metrics.aerobicData.zone1_2Percent < 75) {
    alerts.push(`Only ${metrics.aerobicData.zone1_2Percent}% in easy zones (target 80%)`);
  }

  // Get upcoming key workout
  const nextKeyWorkout = context.upcomingWorkouts?.find(
    (w) => w.type?.toLowerCase().includes('tempo') ||
      w.type?.toLowerCase().includes('interval') ||
      w.type?.toLowerCase().includes('long')
  );

  return `Generate a brief, personalized daily coaching insight for ${context.firstName}.

## TRAINING STATUS
- Days until race: ${metrics?.goal?.daysUntilRace || 'No race scheduled'}
- Training phase: ${metrics?.trainingContext?.trainingPhase?.toUpperCase() || 'GENERAL'}
- Goal: ${metrics?.goal ? `${formatTime(metrics.goal.targetTimeSeconds)} ${context.activeGoal?.goal_type?.replace('_', ' ') || 'race'}` : 'No specific time goal'}

## THIS WEEK'S PROGRESS
- Volume completed: ${metrics?.weeklyLoad?.completedDistanceKm?.toFixed(1) || 0} km
- Volume planned: ${metrics?.weeklyLoad?.plannedDistanceKm?.toFixed(1) || 0} km
- Progress: ${weeklyVolumePercent || 0}%
- Volume change vs typical: ${volumeChange}%

## INTENSITY DISTRIBUTION
- Zone 1-2 (easy): ${metrics?.aerobicData?.zone1_2Percent || 'N/A'}%
- Zone 4-5 (hard): ${metrics?.aerobicData?.zone4_5Percent || 'N/A'}%

## UPCOMING KEY WORKOUT
${nextKeyWorkout ? `${nextKeyWorkout.type} - ${nextKeyWorkout.targetDistance?.toFixed(1) || '?'} km on ${new Date(nextKeyWorkout.date).toLocaleDateString('en-US', { weekday: 'long' })}` : 'None scheduled'}

## ALERTS TO ADDRESS
${alerts.length > 0 ? alerts.map((a) => `- ${a}`).join('\n') : '- No concerns - training on track'}

## YOUR TASK
Write ONE paragraph (2-3 sentences max) that:
1. Acknowledges their current status (ahead/behind/on track)
2. Provides ONE specific, actionable recommendation
3. Connects to their race goal if applicable

Be concise. Be specific. No generic advice.
Do NOT start with "Great job" or similar - get straight to the insight.`;
}

/**
 * Helper to format seconds to time string
 */
function formatTime(seconds?: number): string {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if user has dismissed today's insight
 */
async function isInsightDismissed(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT dismissed_until FROM coach_insight_dismissals
     WHERE user_id = $1 AND dismissed_until > NOW()`,
    [userId]
  );
  return result.rows.length > 0;
}

/**
 * Get cached insight if still fresh (generated within last 4 hours)
 */
async function getCachedInsight(userId: number): Promise<CoachInsight | null> {
  const result = await pool.query(
    `SELECT insight_data, generated_at FROM coach_daily_insights
     WHERE user_id = $1 AND generated_at > NOW() - INTERVAL '4 hours'
     ORDER BY generated_at DESC LIMIT 1`,
    [userId]
  );

  if (result.rows.length > 0) {
    return {
      ...result.rows[0].insight_data,
      generatedAt: result.rows[0].generated_at,
    };
  }
  return null;
}

/**
 * Cache the generated insight
 */
async function cacheInsight(userId: number, insight: CoachInsight): Promise<void> {
  await pool.query(
    `INSERT INTO coach_daily_insights (user_id, insight_data, generated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET insight_data = $2, generated_at = NOW()`,
    [userId, JSON.stringify(insight)]
  );
}

/**
 * Generate today's coach insight for a user
 */
export async function generateDailyInsight(userId: number): Promise<CoachInsight | null> {
  console.log(`🧠 Generating daily coach insight for user ${userId}...`);

  try {
    // Check if dismissed
    const isDismissed = await isInsightDismissed(userId);
    if (isDismissed) {
      console.log('  Insight dismissed by user');
      return null;
    }

    // Check cache first
    const cached = await getCachedInsight(userId);
    if (cached) {
      console.log('  Using cached insight');
      return cached;
    }

    // Build context
    const context = await buildUserContext(userId);

    // Build prompts
    const coachStylePrompt = getCoachStylePrompt(context.profile);
    const insightPrompt = buildInsightPrompt(context);

    // Generate with OpenAI
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an elite running coach generating a daily insight for your athlete.
${coachStylePrompt}

Keep your response to 2-3 sentences maximum. Be specific to their data.`,
        },
        {
          role: 'user',
          content: insightPrompt,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const insightText = response.choices[0]?.message?.content?.trim() || '';

    // Determine priority based on alerts
    const metrics = context.marathonMetrics;
    const weeklyVolumePercent = metrics?.weeklyLoad
      ? Math.round((metrics.weeklyLoad.completedDistanceKm / metrics.weeklyLoad.plannedDistanceKm) * 100)
      : 100;

    let priority: 'info' | 'action' | 'warning' | 'celebration' = 'info';
    if (weeklyVolumePercent >= 100) {
      priority = 'celebration';
    } else if (weeklyVolumePercent < 70) {
      priority = 'warning';
    } else if (weeklyVolumePercent < 90) {
      priority = 'action';
    }

    const insight: CoachInsight = {
      insight: insightText,
      priority,
      metrics: {
        volumeStatus: `${weeklyVolumePercent}%`,
        executionStatus: weeklyVolumePercent >= 90 ? 'on_track' : weeklyVolumePercent >= 70 ? 'behind' : 'at_risk',
        daysUntilRace: metrics?.goal?.daysUntilRace || null,
        trainingPhase: metrics?.trainingContext?.trainingPhase || null,
      },
      generatedAt: new Date(),
    };

    // Cache it
    await cacheInsight(userId, insight);

    console.log(`  ✅ Generated insight: "${insightText.substring(0, 50)}..."`);
    return insight;
  } catch (error: any) {
    console.error('❌ Error generating daily insight:', error);
    throw error;
  }
}

/**
 * Dismiss today's insight until tomorrow
 */
export async function dismissInsight(userId: number): Promise<void> {
  // Dismiss until midnight tonight
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);

  await pool.query(
    `INSERT INTO coach_insight_dismissals (user_id, dismissed_until)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET dismissed_until = $2`,
    [userId, tomorrow]
  );
}
