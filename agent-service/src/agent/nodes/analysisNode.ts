/**
 * Analysis Node (Pass 1 of Two-Pass Architecture)
 *
 * Performs pure reasoning and analysis WITHOUT tool access.
 * Output is structured analysis that the Execution Node will consume.
 *
 * This node:
 * 1. Selects the appropriate analysis prompt based on intent
 * 2. Has NO tools bound - pure reasoning only
 * 3. Outputs structured analysis with intent-specific focus:
 *    - plan_review: Analyzes UPCOMING workouts - structure, stress distribution, modifications
 *    - progress_tracking: Analyzes COMPLETED workouts - execution quality, patterns, adjustments
 *    - run_analysis: Analyzes a single run - physiological impact, plan implications
 * 4. Final verdict and specific recommendations
 */

import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { buildAnalysisPassPrompt, buildRunAnalysisPassPrompt, buildProgressAnalysisPassPrompt, buildHistoricalProgressPrompt } from '../../config/specializedPrompts';

/**
 * Analysis Node (Pass 1)
 * Generates structured analysis without tool calls
 */
export async function analysisNode(state: any) {
  console.log('🔬 Pass 1: Analysis Node - Pure reasoning...');

  const intent = state.intent || 'general_chat';

  // Only run analysis for coaching intents that use two-pass architecture
  if (intent !== 'plan_review' && intent !== 'progress_tracking' && intent !== 'run_analysis') {
    console.log(`ℹ️ Skipping analysis pass for intent: ${intent}`);
    return {
      analysisResult: null,
      stepCount: state.stepCount + 1,
    };
  }

  // Select the appropriate analysis prompt based on intent
  let analysisPrompt: string;
  let userPromptPrefix: string;

  if (intent === 'run_analysis') {
    // Analyze a specific completed run
    analysisPrompt = buildRunAnalysisPassPrompt(state.userContext);
    userPromptPrefix = 'Analyze this run and determine if plan adjustments are needed:';
    console.log('📊 Using RUN ANALYSIS prompt');
  } else if (intent === 'progress_tracking') {
    // Check if this is a historical/overall progress query (has historicalProgress data)
    const isHistorical = state.userContext?.historicalProgress != null;

    if (isHistorical) {
      // Analyze FULL training history - overall progress review
      analysisPrompt = buildHistoricalProgressPrompt(state.userContext);
      userPromptPrefix = 'Provide a comprehensive assessment of overall training progress:';
      console.log('📊 Using HISTORICAL PROGRESS prompt (full training history focus)');
    } else {
      // Analyze COMPLETED workouts from THIS WEEK - what actually happened
      analysisPrompt = buildProgressAnalysisPassPrompt(state.userContext);
      userPromptPrefix = 'Analyze the completed workouts from this training week:';
      console.log('📊 Using WEEKLY PROGRESS ANALYSIS prompt (completed workouts focus)');
    }
  } else {
    // plan_review - analyze UPCOMING workouts
    analysisPrompt = buildAnalysisPassPrompt(state.userContext);
    userPromptPrefix = 'Analyze the upcoming training plan for:';
    console.log('📊 Using PLAN REVIEW prompt (upcoming workouts focus)');
  }

  // Get the original user message
  const userMessages = state.messages.filter((m: BaseMessage) => m._getType() === 'human');
  const originalUserMessage = userMessages[userMessages.length - 1]?.content?.toString() || '';

  // Create messages for analysis pass
  const analysisMessages: BaseMessage[] = [
    new SystemMessage(analysisPrompt),
    new HumanMessage(`${userPromptPrefix} "${originalUserMessage}"`),
  ];

  // Use gpt-4o for high-quality reasoning
  const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.3, // Lower temperature for consistent structured output
    streaming: false,
  });

  console.log('📊 Invoking analysis model (no tools)...');

  try {
    const response = await model.invoke(analysisMessages);
    const analysisResult = response.content?.toString() || '';

    console.log('\n========== PASS 1: ANALYSIS RESULT ==========');
    console.log(analysisResult.substring(0, 500) + '...');
    console.log('========== END ANALYSIS RESULT ==========\n');

    // Extract verdict from analysis (handles all formats)
    // Plan Review: **VERDICT:** SOUND
    // Run Analysis: **PLAN VERDICT:** SOUND, **RUN VERDICT:** WELL EXECUTED
    // Progress Tracking: **WEEK EXECUTION:** GOOD, **PLAN VERDICT:** SOUND
    const planVerdictMatch = analysisResult.match(/\*\*(?:PLAN\s+)?VERDICT:\*\*\s*(SOUND|MINOR_ADJUSTMENTS|SIGNIFICANT_ISSUES)/i);
    const verdict = planVerdictMatch ? planVerdictMatch[1].toUpperCase() : 'UNKNOWN';

    // For run analysis, extract the run verdict
    const runVerdictMatch = analysisResult.match(/\*\*RUN VERDICT:\*\*\s*(WELL EXECUTED|ACCEPTABLE|CONCERNING|PROBLEMATIC)/i);
    if (runVerdictMatch) {
      console.log(`🏃 Run verdict: ${runVerdictMatch[1].toUpperCase()}`);
    }

    // For progress tracking, extract week execution verdict
    const weekExecutionMatch = analysisResult.match(/\*\*WEEK EXECUTION:\*\*\s*(EXCELLENT|GOOD|ACCEPTABLE|CONCERNING|POOR)/i);
    if (weekExecutionMatch) {
      console.log(`📈 Week execution: ${weekExecutionMatch[1].toUpperCase()}`);
    }

    console.log(`📋 Plan verdict: ${verdict}`);

    return {
      analysisResult,
      analysisVerdict: verdict,
      stepCount: state.stepCount + 1,
    };
  } catch (error: any) {
    console.error('❌ Analysis pass failed:', error);
    return {
      analysisResult: `Analysis failed: ${error.message}`,
      analysisVerdict: 'ERROR',
      stepCount: state.stepCount + 1,
    };
  }
}
