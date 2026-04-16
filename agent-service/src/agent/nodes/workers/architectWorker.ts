/**
 * Architect Worker
 *
 * Specialized worker for training plan review and modifications.
 * PRESERVES TWO-PASS ARCHITECTURE: Analysis (gpt-4o) → Execution (gpt-4o-mini)
 *
 * Handles:
 * - "Review my plan for next week"
 * - "Move my long run to Friday"
 * - "Is my plan structured well?"
 * - "Would you change anything about my schedule?"
 *
 * Context Tier: ACTIVE (~3k tokens)
 * Tools: All 7 workout modification tools + get_upcoming_workouts
 * Model: gpt-4o (analysis) → gpt-4o-mini (execution) - 90% cost savings
 */

import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SupervisorStateType, WorkerOutput, PendingAction } from '../../workflow/supervisorState';
import { backendClient } from '../../../api/backendClient';
import { architectDataTools } from '../../tools/dataTools';
import { workoutTools } from '../../tools/workoutTools';

// Combine data tools and workout modification tools
const allArchitectTools = [...architectDataTools, ...workoutTools];

/**
 * Build the architect analysis prompt (Pass 1)
 */
function buildArchitectAnalysisPrompt(coreContext: any, upcomingWorkouts: any[]): string {
  const workoutList = upcomingWorkouts.map((w: any) => {
    const date = new Date(w.scheduledDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const distance = w.targetDistanceMeters ? `${(w.targetDistanceMeters / 1000).toFixed(1)}km` : 'N/A';
    const pace = w.targetPaceAvg ? formatPace(w.targetPaceAvg) : 'N/A';
    return `  [ID:${w.id}] ${date}: ${w.name || w.workoutType} - ${distance} @ ${pace}`;
  }).join('\n');

  return `You are a strategic training plan architect reviewing a marathon training plan.

ATHLETE PROFILE:
- Name: ${coreContext.firstName}
- Goal: ${coreContext.goalType || 'General fitness'}${coreContext.goalPace ? ` at ${coreContext.goalPace}` : ''}
- Target Time: ${coreContext.goalTimeFormatted || 'Not set'}
- Training Phase: ${coreContext.trainingPhase || 'Unknown'}
- Weeks to Goal: ${coreContext.weeksRemaining || 'N/A'}

UPCOMING WORKOUTS (Next 14 days):
${workoutList || 'No workouts scheduled'}

YOUR TASK - ANALYSIS ONLY (No tool calls):
1. Evaluate the training plan structure
2. Check workout distribution (hard days, easy days, rest)
3. Verify volume progression is appropriate
4. Look for potential issues or conflicts
5. Consider the athlete's training phase

OUTPUT FORMAT:
Provide a structured analysis with:

**PLAN ANALYSIS:**
[Your detailed analysis]

**STRENGTHS:**
- [List strengths]

**CONCERNS (if any):**
- [List concerns with specific workout IDs]

**VERDICT:** [SOUND | MINOR_ADJUSTMENTS | SIGNIFICANT_ISSUES]

**RECOMMENDED CHANGES (if any):**
- [Specific actionable changes with workout IDs]

Do NOT call any tools in this pass. Focus purely on analysis.`;
}

/**
 * Build the architect execution prompt (Pass 2)
 */
function buildArchitectExecutionPrompt(analysisResult: string, verdict: string): string {
  return `Based on the following plan analysis, execute the recommended changes using the available tools.

ANALYSIS RESULT:
${analysisResult}

VERDICT: ${verdict}

INSTRUCTIONS:
${verdict === 'SOUND' ? `
The plan looks good. Call the approve_plan tool to confirm.
` : `
Execute the recommended changes using the appropriate tools:
- shift_workout: Move a workout to a different date
- modify_workout: Change workout parameters (distance, pace, etc.)
- create_workout: Add a new workout
- delete_workout: Remove a workout

For each change, provide clear reasoning in the tool call.
`}

Execute the necessary tool calls now.`;
}

/**
 * Extract verdict from analysis result
 */
function extractVerdict(analysisResult: string): string {
  const verdictMatch = analysisResult.match(/\*\*VERDICT:\*\*\s*(SOUND|MINOR_ADJUSTMENTS|SIGNIFICANT_ISSUES)/i);
  return verdictMatch ? verdictMatch[1].toUpperCase() : 'SOUND';
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
 * Architect Worker Node (Two-Pass)
 */
export async function architectWorker(
  state: SupervisorStateType
): Promise<Partial<SupervisorStateType>> {
  console.log('\n📐 ========== ARCHITECT WORKER ==========');
  console.log(`User Query: "${state.userQuery.substring(0, 100)}..."`);

  try {
    // Load context
    console.log('📦 Loading context...');
    const coreContext = state.contextTiers.core || await backendClient.getCoreContext(state.userId);
    const upcomingWorkouts = await backendClient.getUpcomingWorkouts(state.userId, 14);

    // ========== PASS 1: ANALYSIS (gpt-4o, no tools) ==========
    console.log('\n🔍 Pass 1: Analysis (gpt-4o, no tools)');

    const analysisPrompt = buildArchitectAnalysisPrompt(coreContext, upcomingWorkouts);
    const analysisModel = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3,
    });

    const analysisResponse = await analysisModel.invoke([
      new SystemMessage(analysisPrompt),
      new HumanMessage(state.userQuery),
    ]);

    const analysisResult = analysisResponse.content.toString();
    const analysisVerdict = extractVerdict(analysisResult);

    console.log(`   Verdict: ${analysisVerdict}`);
    const analysisUsage = (analysisResponse as any).usage_metadata;
    const pass1Tokens = analysisUsage?.total_tokens || 0;
    console.log(`   Tokens: ${pass1Tokens}`);

    // ========== PASS 2: EXECUTION (gpt-4o-mini, with tools) ==========
    console.log('\n⚡ Pass 2: Execution (gpt-4o-mini, with tools)');

    const executionPrompt = buildArchitectExecutionPrompt(analysisResult, analysisVerdict);
    const executionModel = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1, // Very low for deterministic tool calling
    }).bindTools(allArchitectTools, {
      tool_choice: analysisVerdict !== 'SOUND' ? 'required' : 'auto',
    });

    const executionResponse = await executionModel.invoke([
      new SystemMessage(executionPrompt),
      new HumanMessage('Execute the necessary changes based on the analysis.'),
    ]);

    const executionUsage = (executionResponse as any).usage_metadata;
    const pass2Tokens = executionUsage?.total_tokens || 0;
    console.log(`   Tokens: ${pass2Tokens}`);

    // Extract tool calls
    const toolCalls = (executionResponse as any).tool_calls || [];
    console.log(`   Tool calls: ${toolCalls.length}`);

    // Convert tool calls to pending actions
    const pendingActions: PendingAction[] = toolCalls
      .filter((tc: any) => !tc.name.startsWith('get_')) // Filter out data-fetching tools
      .map((tc: any) => ({
        action_type: tc.name,
        action_payload: tc.args,
        agent_reasoning: `Based on plan analysis: ${analysisVerdict}`,
      }));

    const totalTokens = pass1Tokens + pass2Tokens;
    console.log(`\n✅ Architect Worker complete (${totalTokens} total tokens)`);
    console.log('==========================================\n');

    // Build worker output
    const workerOutput: WorkerOutput = {
      worker: 'architect',
      content: analysisResult,
      toolCalls,
      pendingActions,
      tokensUsed: totalTokens,
      modelUsed: 'gpt-4o + gpt-4o-mini',
    };

    return {
      workerOutputs: [workerOutput],
      contextTiers: {
        ...state.contextTiers,
        core: coreContext,
      },
      messages: [...state.messages, analysisResponse as AIMessage],
      stepCount: state.stepCount + 1,
      currentWorker: 'architect',
      analysisResult,
      analysisVerdict,
      pendingActions,
      modelUsed: {
        ...state.modelUsed,
        architect_analysis: 'gpt-4o',
        architect_execution: 'gpt-4o-mini',
      },
    };
  } catch (error) {
    console.error('❌ Architect Worker Error:', error);

    return {
      workerOutputs: [
        {
          worker: 'architect',
          content: `I encountered an error reviewing your plan. ${error}`,
          tokensUsed: 0,
          modelUsed: 'gpt-4o',
        },
      ],
      error: `Architect error: ${error}`,
      stepCount: state.stepCount + 1,
    };
  }
}
