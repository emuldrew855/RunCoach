/**
 * Performance Analysis Service
 *
 * The "Intelligence Layer" - Acts as a Diagnostic Engine that analyzes
 * the delta between Intent (Goals) and Reality (Baseline/Actuals) to
 * produce a dynamic "Status Pulse" for the dashboard.
 *
 * Runner Types:
 * - Ghost: No data in 7 days - returns null
 * - Architect: Has active training plan - focus on execution accuracy
 * - Builder: No plan, high activity intent - focus on progressive overload
 * - Maintainer: Casual runner - focus on consistency & health
 */

import { openai, openaiConfig } from '../config/openai';
import pool from '../config/database';
import { get4WeekRollingBaseline, inferRunnerType } from './baselineMetricsService';
import { getActivePlan } from '../models/TrainingPlan';
import { getProfileByUserId } from '../models/UserProfile';
import { RollingBaseline, RunnerType } from '../types/models';

// ============================================================================
// Types
// ============================================================================

export type AnalysisRunnerType = 'ghost' | 'architect' | 'builder' | 'maintainer';
export type AnalysisSentiment = 'positive' | 'warning' | 'neutral';
export type AnalysisStatus =
  | 'OPTIMIZING'
  | 'ON_TRACK'
  | 'OVERREACHING'
  | 'RECOVERING'
  | 'BUILDING'
  | 'STABLE'
  | 'INCONSISTENT'
  | 'RESTING';

export interface SmartAnalysis {
  isVisible: boolean;
  runnerType: AnalysisRunnerType;
  status: AnalysisStatus;
  statusLabel: string;  // Human-friendly status label
  analysis: string;     // Max 250 chars - the "Coach Pulse"
  sentiment: AnalysisSentiment;
  highlightedMetric?: {
    label: string;
    value: string;
    unit: string;
  };
  generatedAt: string;
}

export interface AnalysisContext {
  runnerType: AnalysisRunnerType;
  hasActivePlan: boolean;
  daysSinceLastActivity: number;

  // Weekly metrics
  thisWeekDistance: number;
  thisWeekRuns: number;
  thisWeekAvgPace: number | null;
  thisWeekAvgHR: number | null;

  // Baseline metrics (4-week rolling)
  baselineDistance: number;
  baselineRuns: number;
  baselinePace: number | null;
  percentOfBaseline: number;
  distanceTrend: 'increasing' | 'stable' | 'decreasing';
  paceTrend: 'improving' | 'stable' | 'declining';

  // Plan compliance (for Architect)
  complianceScore?: number;  // % of planned workouts completed
  intensityAccuracy?: string; // e.g., "easy runs drifting into zone 3"

  // Week-over-week change
  volumeChangePercent: number;
}

// ============================================================================
// Data Gathering
// ============================================================================

async function getLastActivityDate(userId: number): Promise<Date | null> {
  const result = await pool.query(
    `SELECT MAX(start_date) as last_activity
     FROM activities
     WHERE user_id = $1
       AND sport_type IN ('Run', 'VirtualRun', 'TrailRun')`,
    [userId]
  );

  return result.rows[0]?.last_activity || null;
}

async function getThisWeekMetrics(userId: number): Promise<{
  distance: number;
  runs: number;
  avgPace: number | null;
  avgHR: number | null;
  zone3PlusPercent: number;
}> {
  // Get Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const result = await pool.query(
    `SELECT
       COUNT(*) as run_count,
       COALESCE(SUM(distance_meters) / 1000, 0) as total_distance_km,
       COALESCE(AVG(CASE WHEN average_speed > 0 THEN 1000 / (average_speed * 60) END), 0) as avg_pace,
       COALESCE(AVG(average_heartrate), 0) as avg_hr
     FROM activities
     WHERE user_id = $1
       AND sport_type IN ('Run', 'VirtualRun', 'TrailRun')
       AND start_date >= $2`,
    [userId, monday.toISOString()]
  );

  // Get HR zone distribution for this week
  const hrResult = await pool.query(
    `SELECT
       COALESCE(SUM(zone_3_seconds + zone_4_seconds + zone_5_seconds), 0) as high_zone_seconds,
       COALESCE(SUM(zone_1_seconds + zone_2_seconds + zone_3_seconds + zone_4_seconds + zone_5_seconds), 0) as total_seconds
     FROM activity_hr_zones hz
     JOIN activities a ON hz.activity_id = a.id
     WHERE a.user_id = $1
       AND a.start_date >= $2`,
    [userId, monday.toISOString()]
  );

  const hrData = hrResult.rows[0];
  const totalSeconds = parseInt(hrData.total_seconds) || 1;
  const zone3PlusPercent = Math.round((parseInt(hrData.high_zone_seconds) / totalSeconds) * 100);

  const data = result.rows[0];
  return {
    distance: parseFloat(data.total_distance_km) || 0,
    runs: parseInt(data.run_count) || 0,
    avgPace: parseFloat(data.avg_pace) || null,
    avgHR: parseFloat(data.avg_hr) || null,
    zone3PlusPercent: zone3PlusPercent || 0,
  };
}

async function getComplianceScore(userId: number): Promise<{
  score: number;
  intensityIssue: string | null;
}> {
  // Get this week's planned vs completed workouts
  // IMPORTANT: Only count workouts scheduled on or before TODAY for compliance
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  // Use today as the end date for compliance (not Sunday)
  // This way we only count workouts that SHOULD have been completed by now
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const mondayStr = monday.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  console.log(`📊 Compliance check: Monday=${mondayStr}, Today=${todayStr}`);

  const result = await pool.query(
    `SELECT
       COUNT(*) as total_planned,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) as completed,
       COUNT(CASE WHEN completion_status = 'skipped' THEN 1 END) as skipped
     FROM planned_workouts
     WHERE user_id = $1
       AND scheduled_date >= $2
       AND scheduled_date <= $3`,
    [userId, mondayStr, todayStr]
  );

  const data = result.rows[0];
  const totalPlanned = parseInt(data.total_planned) || 0;
  const completed = parseInt(data.completed) || 0;
  const skipped = parseInt(data.skipped) || 0;

  console.log(`📊 Compliance: ${completed} completed / ${totalPlanned} planned (${skipped} skipped)`);

  const score = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 100;
  console.log(`📊 Compliance score: ${score}%`);

  // Check for intensity drift (easy runs in high HR zones)
  const intensityResult = await pool.query(
    `SELECT
       pw.workout_type,
       AVG(hz.zone_3_seconds + hz.zone_4_seconds + hz.zone_5_seconds) /
       NULLIF(AVG(hz.zone_1_seconds + hz.zone_2_seconds + hz.zone_3_seconds + hz.zone_4_seconds + hz.zone_5_seconds), 0) as high_zone_ratio
     FROM planned_workouts pw
     JOIN activities a ON pw.completed_activity_id = a.id
     JOIN activity_hr_zones hz ON a.id = hz.activity_id
     WHERE pw.user_id = $1
       AND pw.scheduled_date >= $2
       AND pw.scheduled_date <= $3
       AND pw.workout_type IN ('easy', 'recovery')
     GROUP BY pw.workout_type`,
    [userId, monday.toISOString().split('T')[0], today.toISOString().split('T')[0]]
  );

  let intensityIssue: string | null = null;
  for (const row of intensityResult.rows) {
    const highZoneRatio = parseFloat(row.high_zone_ratio) || 0;
    if (highZoneRatio > 0.3) { // More than 30% in zone 3+
      intensityIssue = `${row.workout_type} runs drifting into Zone 3+`;
      break;
    }
  }

  return { score, intensityIssue };
}

// ============================================================================
// Analysis Context Builder
// ============================================================================

async function buildAnalysisContext(userId: number): Promise<AnalysisContext | null> {
  // Check last activity date
  const lastActivityDate = await getLastActivityDate(userId);

  if (!lastActivityDate) {
    return null; // Ghost - no data at all
  }

  const daysSinceLastActivity = Math.floor(
    (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check for active plan
  const activePlan = await getActivePlan(userId);
  const hasActivePlan = !!activePlan;

  // Determine runner type
  let runnerType: AnalysisRunnerType;
  if (daysSinceLastActivity >= 7) {
    runnerType = 'ghost';
  } else if (hasActivePlan) {
    runnerType = 'architect';
  } else {
    // Check if they're building or maintaining
    const inferredType = await inferRunnerType(userId);
    runnerType = inferredType === 'builder' ? 'builder' : 'maintainer';
  }

  // Get baseline metrics
  const baseline = await get4WeekRollingBaseline(userId);

  // Get this week's metrics
  const thisWeek = await getThisWeekMetrics(userId);

  // Calculate volume change
  const baselineDistance = baseline?.avgDistanceKm || 0;
  const volumeChangePercent = baselineDistance > 0
    ? Math.round(((thisWeek.distance - baselineDistance) / baselineDistance) * 100)
    : 0;

  // Get compliance for architects
  let complianceScore: number | undefined;
  let intensityAccuracy: string | undefined;

  if (runnerType === 'architect') {
    const compliance = await getComplianceScore(userId);
    complianceScore = compliance.score;
    intensityAccuracy = compliance.intensityIssue || undefined;
  }

  return {
    runnerType,
    hasActivePlan,
    daysSinceLastActivity,
    thisWeekDistance: Math.round(thisWeek.distance * 10) / 10,
    thisWeekRuns: thisWeek.runs,
    thisWeekAvgPace: thisWeek.avgPace ? Math.round(thisWeek.avgPace * 100) / 100 : null,
    thisWeekAvgHR: thisWeek.avgHR ? Math.round(thisWeek.avgHR) : null,
    baselineDistance: Math.round(baselineDistance * 10) / 10,
    baselineRuns: baseline?.avgRunsPerWeek || 0,
    baselinePace: baseline?.avgPaceMinKm || null,
    percentOfBaseline: baseline?.percentOfBaseline || 100,
    distanceTrend: baseline?.distanceTrend || 'stable',
    paceTrend: baseline?.paceTrend || 'stable',
    complianceScore,
    intensityAccuracy,
    volumeChangePercent,
  };
}

// ============================================================================
// LLM Diagnostic Engine
// ============================================================================

function buildDiagnosticPrompt(context: AnalysisContext): string {
  const { runnerType } = context;

  let focusArea: string;
  let analysisInstructions: string;

  switch (runnerType) {
    case 'architect':
      focusArea = 'EXECUTION ACCURACY';
      analysisInstructions = `
        Focus on plan compliance and intensity accuracy.
        - Compare actual vs. prescribed intensity
        - Flag if easy runs are too hard (HR drift)
        - Acknowledge volume consistency
        Key question: Are they executing the plan correctly?`;
      break;

    case 'builder':
      focusArea = 'PROGRESSIVE OVERLOAD';
      analysisInstructions = `
        Focus on safe volume progression.
        - Check if volume increase is sustainable (<10% per week)
        - Monitor HR response to load increases
        - Watch for overreaching signs
        Key question: Is their body absorbing the increased load?`;
      break;

    case 'maintainer':
      focusArea = 'CONSISTENCY & HEALTH';
      analysisInstructions = `
        Focus on streaks and natural improvement.
        - Highlight consistency patterns
        - Note any organic pace improvements
        - Encourage sustainable habits
        Key question: Are they building healthy running habits?`;
      break;

    default:
      focusArea = 'GENERAL';
      analysisInstructions = 'Provide general running insights.';
  }

  return `You are a Senior Sports Scientist & Performance Analyst acting as a Diagnostic Engine.

ROLE: Analyze the runner's current training state and produce a precise 2-sentence "Status Pulse".

RUNNER TYPE: ${runnerType.toUpperCase()}
ANALYSIS FOCUS: ${focusArea}

${analysisInstructions}

RUNNER DATA:
- Days since last activity: ${context.daysSinceLastActivity}
- This week: ${context.thisWeekDistance} km over ${context.thisWeekRuns} runs
- 4-week baseline: ${context.baselineDistance} km/week average
- Volume vs baseline: ${context.percentOfBaseline}%
- Week-over-week change: ${context.volumeChangePercent > 0 ? '+' : ''}${context.volumeChangePercent}%
- Distance trend: ${context.distanceTrend}
- Pace trend: ${context.paceTrend}
${context.thisWeekAvgHR ? `- Average HR this week: ${context.thisWeekAvgHR} bpm` : ''}
${context.thisWeekAvgPace ? `- Average pace this week: ${formatPace(context.thisWeekAvgPace)}` : ''}
${context.complianceScore !== undefined ? `- Plan compliance: ${context.complianceScore}%` : ''}
${context.intensityAccuracy ? `- Intensity issue detected: ${context.intensityAccuracy}` : ''}

RESPONSE FORMAT (JSON only):
{
  "status": "OPTIMIZING|ON_TRACK|OVERREACHING|RECOVERING|BUILDING|STABLE|INCONSISTENT|RESTING",
  "sentiment": "positive|warning|neutral",
  "analysis": "Two sentences MAX. Be specific. Reference actual numbers. Max 250 characters.",
  "highlightMetric": {
    "label": "metric name",
    "value": "number",
    "unit": "km|bpm|%|min/km"
  }
}

RULES:
1. Analysis MUST be under 250 characters
2. Use specific numbers from the data (e.g., "12% volume increase", "142 bpm avg HR")
3. Be direct and actionable - no fluff
4. Match sentiment to the analysis:
   - positive: on track, improving, good execution
   - warning: overreaching, intensity drift, inconsistent
   - neutral: stable, recovery week, building phase
5. The highlighted metric should be the most important data point supporting your analysis`;
}

function formatPace(paceMinKm: number): string {
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

async function generateAnalysisWithLLM(context: AnalysisContext): Promise<{
  status: AnalysisStatus;
  sentiment: AnalysisSentiment;
  analysis: string;
  highlightedMetric?: SmartAnalysis['highlightedMetric'];
}> {
  const prompt = buildDiagnosticPrompt(context);

  try {
    const response = await openai.chat.completions.create({
      model: openaiConfig.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate the status pulse analysis.' }
      ],
      max_tokens: 300,
      temperature: 0.3, // Lower temperature for more consistent output
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(content);

    // Validate and sanitize the response
    const validStatuses: AnalysisStatus[] = ['OPTIMIZING', 'ON_TRACK', 'OVERREACHING', 'RECOVERING', 'BUILDING', 'STABLE', 'INCONSISTENT', 'RESTING'];
    const validSentiments: AnalysisSentiment[] = ['positive', 'warning', 'neutral'];

    const status: AnalysisStatus = validStatuses.includes(parsed.status) ? parsed.status : 'STABLE';
    const sentiment: AnalysisSentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral';

    // Ensure analysis is under 250 chars
    let analysis = parsed.analysis || 'Analysis unavailable.';
    if (analysis.length > 250) {
      analysis = analysis.substring(0, 247) + '...';
    }

    return {
      status,
      sentiment,
      analysis,
      highlightedMetric: parsed.highlightMetric || undefined,
    };
  } catch (error) {
    console.error('Error generating analysis with LLM:', error);

    // Fallback to rule-based analysis
    return generateFallbackAnalysis(context);
  }
}

function generateFallbackAnalysis(context: AnalysisContext): {
  status: AnalysisStatus;
  sentiment: AnalysisSentiment;
  analysis: string;
  highlightedMetric?: SmartAnalysis['highlightedMetric'];
} {
  const { runnerType, volumeChangePercent, percentOfBaseline, distanceTrend, complianceScore } = context;

  // Rule-based fallback
  if (runnerType === 'architect') {
    if (complianceScore && complianceScore >= 80) {
      return {
        status: 'ON_TRACK',
        sentiment: 'positive',
        analysis: `Plan execution at ${complianceScore}%. You're hitting your targets consistently.`,
        highlightedMetric: { label: 'Compliance', value: String(complianceScore), unit: '%' },
      };
    } else if (complianceScore && complianceScore < 50) {
      return {
        status: 'INCONSISTENT',
        sentiment: 'warning',
        analysis: `Only ${complianceScore}% plan compliance this week. Consider adjusting your schedule or plan intensity.`,
        highlightedMetric: { label: 'Compliance', value: String(complianceScore), unit: '%' },
      };
    }
  }

  if (volumeChangePercent > 15) {
    return {
      status: 'OVERREACHING',
      sentiment: 'warning',
      analysis: `Volume up ${volumeChangePercent}% this week. Monitor fatigue and consider a recovery day.`,
      highlightedMetric: { label: 'Volume Change', value: `+${volumeChangePercent}`, unit: '%' },
    };
  }

  if (volumeChangePercent > 5 && volumeChangePercent <= 15) {
    return {
      status: 'BUILDING',
      sentiment: 'positive',
      analysis: `Healthy ${volumeChangePercent}% volume increase. Your body is adapting well to the progressive load.`,
      highlightedMetric: { label: 'Volume Change', value: `+${volumeChangePercent}`, unit: '%' },
    };
  }

  if (distanceTrend === 'stable') {
    return {
      status: 'STABLE',
      sentiment: 'neutral',
      analysis: `Maintaining ${context.baselineDistance} km/week baseline. Consistent effort builds lasting fitness.`,
      highlightedMetric: { label: 'Weekly Avg', value: String(context.baselineDistance), unit: 'km' },
    };
  }

  return {
    status: 'STABLE',
    sentiment: 'neutral',
    analysis: `${context.thisWeekDistance} km logged this week. Keep building your running habit.`,
    highlightedMetric: { label: 'This Week', value: String(context.thisWeekDistance), unit: 'km' },
  };
}

// ============================================================================
// Status Labels
// ============================================================================

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  OPTIMIZING: 'Optimizing Performance',
  ON_TRACK: 'On Track',
  OVERREACHING: 'Overreaching Risk',
  RECOVERING: 'Recovery Phase',
  BUILDING: 'Building Base',
  STABLE: 'Maintaining Fitness',
  INCONSISTENT: 'Needs Attention',
  RESTING: 'Rest Period',
};

// ============================================================================
// Main Export
// ============================================================================

export async function getSmartAnalysis(userId: number): Promise<SmartAnalysis> {
  // Build context
  const context = await buildAnalysisContext(userId);

  // Ghost state - no data
  if (!context || context.runnerType === 'ghost') {
    return {
      isVisible: false,
      runnerType: 'ghost',
      status: 'RESTING',
      statusLabel: 'No Recent Activity',
      analysis: '',
      sentiment: 'neutral',
      generatedAt: new Date().toISOString(),
    };
  }

  // Generate analysis
  const llmResult = await generateAnalysisWithLLM(context);

  return {
    isVisible: true,
    runnerType: context.runnerType,
    status: llmResult.status,
    statusLabel: STATUS_LABELS[llmResult.status],
    analysis: llmResult.analysis,
    sentiment: llmResult.sentiment,
    highlightedMetric: llmResult.highlightedMetric,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get analysis with caching (for dashboard performance)
 * Analysis is cached for 1 hour to avoid repeated LLM calls
 */
export async function getSmartAnalysisCached(userId: number, forceRefresh: boolean = false): Promise<SmartAnalysis> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cacheResult = await pool.query(
      `SELECT analysis_data, generated_at
       FROM performance_analysis_cache
       WHERE user_id = $1
         AND generated_at > NOW() - INTERVAL '1 hour'`,
      [userId]
    );

    if (cacheResult.rows.length > 0) {
      console.log(`📊 Status Pulse: Returning cached analysis (generated at ${cacheResult.rows[0].generated_at})`);
      return cacheResult.rows[0].analysis_data;
    }
  } else {
    console.log(`📊 Status Pulse: Force refresh requested, bypassing cache`);
  }

  // Generate fresh analysis
  const analysis = await getSmartAnalysis(userId);

  // Cache the result
  await pool.query(
    `INSERT INTO performance_analysis_cache (user_id, analysis_data, generated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET analysis_data = $2, generated_at = NOW()`,
    [userId, JSON.stringify(analysis)]
  );

  return analysis;
}
