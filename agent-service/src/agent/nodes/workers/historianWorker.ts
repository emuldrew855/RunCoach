/**
 * Historian Worker
 *
 * Specialized worker for historical progress analysis and long-term trends.
 *
 * Handles:
 * - "How have I been doing overall?"
 * - "Show me my progress since I started"
 * - "What's my trend over the last month?"
 * - "Rate my training so far"
 *
 * Context Tier: DEEP (~15k tokens)
 * Tools: get_historical_summaries, get_hr_zone_summary, (future: rag_search)
 * Model: gpt-4o (quality analysis for trends)
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SupervisorStateType, WorkerOutput } from '../../workflow/supervisorState';
import { backendClient } from '../../../api/backendClient';
import { historianTools } from '../../tools/dataTools';

/**
 * Build the historian system prompt
 */
function buildHistorianPrompt(coreContext: any, deepContext: any, activeContext?: any): string {
  // Build weekly summary (skip current week if incomplete)
  const weeklySummary = deepContext.weeklyInsights.map((w: any, index: number) => {
    const weekDate = new Date(w.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isCurrentWeek = index === 0;
    const weekLabel = isCurrentWeek ? ' (in progress)' : '';
    return `  ${weekDate}: ${w.totalDistanceKm.toFixed(1)}km${weekLabel}, ${w.avgPace ? formatPace(w.avgPace) : 'N/A'} avg pace`;
  }).join('\n');

  // HR zone breakdown
  const hrBreakdown = deepContext.hrZoneDistribution;
  const totalHours = hrBreakdown.totalHours;
  const aerobicPercent = totalHours > 0
    ? Math.round(((hrBreakdown.zone1Hours + hrBreakdown.zone2Hours) / totalHours) * 100)
    : 0;

  // Current week context (workouts remaining)
  let currentWeekContext = '';
  if (activeContext?.thisWeekWorkouts) {
    const pendingWorkouts = activeContext.thisWeekWorkouts.filter((w: any) => w.completionStatus === 'pending');
    const completedWorkouts = activeContext.thisWeekWorkouts.filter((w: any) => w.completionStatus === 'completed');
    const pendingDistanceKm = pendingWorkouts.reduce((sum: number, w: any) =>
      sum + (w.targetDistanceMeters ? w.targetDistanceMeters / 1000 : 0), 0);

    if (pendingWorkouts.length > 0) {
      currentWeekContext = `
CURRENT WEEK STATUS (Week in Progress):
- Completed: ${completedWorkouts.length} workouts
- Remaining: ${pendingWorkouts.length} workouts (${pendingDistanceKm.toFixed(1)}km planned)
- Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
NOTE: Current week is incomplete - do NOT criticize current week's volume.`;
    }
  }

  return `You are a running historian and trend analyst, providing insights on long-term training progress.

ATHLETE PROFILE:
- Name: ${coreContext.firstName}
- Goal: ${coreContext.goalType || 'General fitness'}${coreContext.goalPace ? ` at ${coreContext.goalPace}` : ''}
- Target Time: ${coreContext.goalTimeFormatted || 'Not set'}
- Training Phase: ${coreContext.trainingPhase || 'Unknown'}
- Weeks to Goal: ${coreContext.weeksRemaining || 'N/A'}
- Experience: ${coreContext.experienceYears || 'Unknown'} years

COACHING PERSONALITY:
${getCoachPersonality(coreContext.coachStyle)}

WEEKLY VOLUME HISTORY:
${weeklySummary || 'No data available'}
${currentWeekContext}

LONG RUN PROGRESSION (Last 4 weeks):
${deepContext.longRunProgression.map((km: number) => `${km}km`).join(' → ') || 'No data'}

HR ZONE DISTRIBUTION (30 days):
- Zone 1-2 (Aerobic): ${aerobicPercent}%
- Zone 3 (Tempo): ${Math.round((hrBreakdown.zone3Hours / totalHours) * 100) || 0}%
- Zone 4-5 (Threshold/Max): ${Math.round(((hrBreakdown.zone4Hours + hrBreakdown.zone5Hours) / totalHours) * 100) || 0}%
- Total Training: ${totalHours.toFixed(1)} hours

4-WEEK PLAN ADHERENCE: ${deepContext.planAdherenceLast4Weeks}%

ANALYSIS GUIDELINES:
1. Look at TRENDS over time, not just individual data points
2. Identify patterns in volume, intensity, and consistency
3. Compare current state to goal requirements
4. Highlight positive progress and areas of concern
5. Consider training phase and periodization
6. Be encouraging but honest about gaps

IMPORTANT: All the data you need is provided above. DO NOT say you will analyze - actually DO the analysis now.

OUTPUT FORMAT:
Provide a comprehensive progress review NOW with:
- Overall trajectory assessment
- Volume trend analysis
- Intensity distribution evaluation
- Consistency and adherence review
- Key achievements to celebrate
- Areas for focus going forward

Start your response directly with the analysis, not with "Let me analyze" or similar.

VISUALIZATION:
When showing progress trends, include an execution score chart. Output it as a code block with language "chart-spec":

\`\`\`chart-spec
{"id": "progress-trend-${new Date().toISOString().split('T')[0]}", "type": "execution_score_trend", "title": "Training Quality Trend - Last 4 Weeks", "dataQuery": {"endpoint": "/chart-data/execution-score-trend", "params": {"days": 28, "limit": 20}}, "chartConfig": {"chartType": "line", "height": 300}}
\`\`\`

Include this chart when discussing overall progress or consistency.`;
}

/**
 * Format pace in min:sec per km
 */
function formatPace(paceMinPerKm: number): string {
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

/**
 * Get coach personality based on preference
 */
function getCoachPersonality(style: string): string {
  const personalities: Record<string, string> = {
    'motivational': `Be highly encouraging and positive. Celebrate progress and achievements enthusiastically.
Frame challenges as opportunities for growth. Use energizing language.`,

    'analytical': `Be data-driven and precise. Focus on the numbers and trends.
Provide detailed explanations with specific percentages and comparisons.`,

    'tough_love': `Be direct and no-nonsense. Focus on accountability and what needs improvement.
Challenge the athlete while remaining constructive.`,

    'balanced': `Strike a balance between celebration and honest assessment.
Acknowledge progress while identifying areas for improvement.`,

    'supportive': `Be warm and understanding. Emphasize the positive trajectory.
Frame areas for improvement gently and encouragingly.`,
  };

  return personalities[style] || personalities['balanced'];
}

/**
 * Historian Worker Node
 */
export async function historianWorker(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n📚 ========== HISTORIAN WORKER ==========');
  console.log(`User Query: "${state.userQuery.substring(0, 100)}..."`);

  try {
    // Load deep context for historical analysis + active for current week status
    console.log('📦 Loading DEEP + ACTIVE context...');
    const deepContext = await backendClient.getDeepContext(state.userId);
    const activeContext = await backendClient.getActiveContext(state.userId);
    const coreContext = state.contextTiers.core || await backendClient.getCoreContext(state.userId);

    // Build specialized historian prompt with current week awareness
    const systemPrompt = buildHistorianPrompt(coreContext, deepContext, activeContext);

    // Create model WITHOUT tools - data is already loaded in prompt
    // Tools would be used for JIT fetching, but we've already loaded deep context
    const model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.5, // Slightly creative for narrative
    });

    // Invoke model - limit history to prevent context bleeding
    // Only include last AI response for potential follow-up questions
    const recentHistory = state.messages.slice(-2).filter(m => m._getType() === 'ai');

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      ...recentHistory,
      new HumanMessage(state.userQuery),
    ]);

    // Extract usage metrics
    const usage = (response as any).usage_metadata;
    const tokensUsed = usage?.total_tokens || 0;

    console.log(`✅ Historian Worker complete (${tokensUsed} tokens)`);
    console.log('==========================================\n');

    // Build worker output
    const workerOutput: WorkerOutput = {
      worker: 'historian',
      content: response.content.toString(),
      toolCalls: (response as any).tool_calls,
      tokensUsed,
      modelUsed: 'gpt-4o',
    };

    return {
      workerOutputs: [workerOutput],
      contextTiers: {
        ...state.contextTiers,
        core: coreContext,
        active: activeContext,
        deep: deepContext,
      },
      messages: [...state.messages, response as AIMessage],
      stepCount: state.stepCount + 1,
      currentWorker: 'historian',
      modelUsed: {
        ...state.modelUsed,
        historian: 'gpt-4o',
      },
    };
  } catch (error) {
    console.error('❌ Historian Worker Error:', error);

    return {
      workerOutputs: [
        {
          worker: 'historian',
          content: `I encountered an error analyzing your progress. ${error}`,
          tokensUsed: 0,
          modelUsed: 'gpt-4o',
        },
      ],
      error: `Historian error: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}
