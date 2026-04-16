/**
 * Analyst Worker
 *
 * Specialized worker for analyzing specific runs and performance metrics.
 *
 * Handles:
 * - "How was my run yesterday?"
 * - "Analyze my tempo run"
 * - "What do you think of my splits?"
 * - "Was my HR in the right zones?"
 *
 * Context Tier: ACTIVE (~3k tokens)
 * Tools: get_last_activity, get_recent_activities, get_hr_zone_summary
 * Model: gpt-4o (quality analysis)
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SupervisorStateType, WorkerOutput } from '../../workflow/supervisorState';
import { backendClient } from '../../../api/backendClient';
import { analystTools } from '../../tools/dataTools';

/**
 * Build the analyst system prompt
 */
function buildAnalystPrompt(coreContext: any, activeContext: any): string {
  return `You are an elite running performance analyst, providing detailed analysis of specific runs and workouts.

ATHLETE PROFILE:
- Name: ${coreContext.firstName}
- Goal: ${coreContext.goalType || 'General fitness'}${coreContext.goalPace ? ` at ${coreContext.goalPace}` : ''}
- Training Phase: ${coreContext.trainingPhase || 'Unknown'}
- Weeks to Goal: ${coreContext.weeksRemaining || 'N/A'}
- Experience: ${coreContext.experienceYears || 'Unknown'} years

COACHING PERSONALITY:
${getCoachPersonality(coreContext.coachStyle)}

HR ZONES (if available):
${activeContext.hrZones ? `
- Zone 1 (Recovery): up to ${activeContext.hrZones.zone1Max} bpm
- Zone 2 (Easy): up to ${activeContext.hrZones.zone2Max} bpm
- Zone 3 (Tempo): up to ${activeContext.hrZones.zone3Max} bpm
- Zone 4 (Threshold): up to ${activeContext.hrZones.zone4Max} bpm
- Zone 5 (Max): up to ${activeContext.hrZones.zone5Max} bpm
` : 'Not available'}

LAST TWO RUNS:
${activeContext.lastTwoRuns.map((r: any) => `
- ${r.name} on ${new Date(r.startDate).toLocaleDateString()} (activity_id: ${r.id})
  Distance: ${(r.distanceMeters / 1000).toFixed(1)}km
  Duration: ${Math.round(r.movingTimeSeconds / 60)} min
  Avg Pace: ${r.averagePace ? formatPace(r.averagePace) : 'N/A'}
  Avg HR: ${r.averageHeartrate ? Math.round(r.averageHeartrate) : 'N/A'} bpm
`).join('')}

THIS WEEK'S STATS:
- Total Distance: ${activeContext.thisWeekStats.totalDistanceKm.toFixed(1)}km
- Total Duration: ${Math.round(activeContext.thisWeekStats.totalDurationMinutes)} min
- Run Count: ${activeContext.thisWeekStats.runCount}
- Avg Pace: ${activeContext.thisWeekStats.avgPace ? formatPace(activeContext.thisWeekStats.avgPace) : 'N/A'}
- Avg HR: ${activeContext.thisWeekStats.avgHR || 'N/A'} bpm

IMPORTANT: All the data you need is provided above. DO NOT say you will analyze - actually DO the analysis now.

ANALYSIS GUIDELINES:
1. Focus on the SPECIFIC run being discussed
2. Analyze pace execution, HR response, and effort distribution
3. Compare to goal pace and training zone targets
4. Identify positives first, then areas for improvement
5. Be specific with numbers and percentages
6. Keep analysis concise but thorough

Start your response directly with the analysis, not with "Let me analyze" or similar.

VISUALIZATION:
When analyzing a run, include a pace progression chart. Use the activity_id from the run being discussed.
Output charts as code blocks with language "chart-spec":

Example for pace progression:
\`\`\`chart-spec
{"id": "pace-analysis-[activity_id]", "type": "pace_progression", "title": "[Distance]km Pace Progression", "dataQuery": {"endpoint": "/chart-data/pace-comparison", "params": {"activityId": [activity_id], "limit": 5}}, "chartConfig": {"chartType": "line", "height": 300}}
\`\`\`

Example for HR zone distribution:
\`\`\`chart-spec
{"id": "hr-zones-[activity_id]", "type": "hr_zone_stacked", "title": "[Distance]km HR Zone Distribution", "dataQuery": {"endpoint": "/chart-data/hr-zone-distribution", "params": {"activityId": [activity_id]}}, "chartConfig": {"chartType": "stacked_bar", "height": 300}}
\`\`\`

Include relevant charts at the end of your analysis.`;
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
    'motivational': `Be highly encouraging when analyzing performance. Celebrate achievements enthusiastically.
Frame any issues as opportunities for growth.`,

    'analytical': `Be data-driven and precise in your analysis. Focus on the numbers.
Provide detailed breakdowns with specific metrics and comparisons.`,

    'tough_love': `Be direct about what went well and what didn't. Focus on accountability.
Challenge the athlete to do better while remaining constructive.`,

    'balanced': `Balance praise for good execution with honest assessment of areas to improve.
Be objective and fair in your analysis.`,

    'supportive': `Be warm and encouraging in your analysis. Emphasize the positives first.
Frame areas for improvement gently and constructively.`,
  };

  return personalities[style] || personalities['balanced'];
}

/**
 * Analyst Worker Node
 */
export async function analystWorker(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n📊 ========== ANALYST WORKER ==========');
  console.log(`User Query: "${state.userQuery.substring(0, 100)}..."`);

  try {
    // Load active context for recent runs and this week's data
    console.log('📦 Loading ACTIVE context...');
    const activeContext = await backendClient.getActiveContext(state.userId);
    const coreContext = state.contextTiers.core || await backendClient.getCoreContext(state.userId);

    // Build specialized analyst prompt
    const systemPrompt = buildAnalystPrompt(coreContext, activeContext);

    // Create model WITHOUT tools - data is already loaded in prompt
    // Tools would be used for JIT fetching, but we've already loaded active context
    const model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3, // Lower for more consistent analysis
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

    console.log(`✅ Analyst Worker complete (${tokensUsed} tokens)`);
    console.log('==========================================\n');

    // Build worker output
    const workerOutput: WorkerOutput = {
      worker: 'analyst',
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
      },
      messages: [...state.messages, response as AIMessage],
      stepCount: state.stepCount + 1,
      currentWorker: 'analyst',
      modelUsed: {
        ...state.modelUsed,
        analyst: 'gpt-4o',
      },
    };
  } catch (error) {
    console.error('❌ Analyst Worker Error:', error);

    return {
      workerOutputs: [
        {
          worker: 'analyst',
          content: `I encountered an error analyzing your run. ${error}`,
          tokensUsed: 0,
          modelUsed: 'gpt-4o',
        },
      ],
      error: `Analyst error: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}
