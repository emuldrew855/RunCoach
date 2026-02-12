/**
 * Daily Insight Service
 *
 * Core analytics engine that computes structured running insights
 * for each activity. Provides specific, data-driven metrics that
 * feed into the AI coach's context.
 *
 * Computed insights include:
 * - Pacing analysis (consistency, fade detection)
 * - HR behavior (drift, zone distribution, effort mismatch)
 * - Effort assessment and execution score
 * - Compliance with planned workout
 * - Risk indicators
 * - Coaching points with specific guidance
 */

import pool from '../config/database';
import { DailyRunInsight } from '../types/insights';

/**
 * Main function: Compute and store daily insight for an activity
 *
 * Called immediately after activity sync from Strava.
 * Analyzes the activity data and generates structured insights.
 */
export async function computeDailyInsight(
  userId: number,
  activityId: number,
  activityData: any,
  plannedWorkout?: any
): Promise<DailyRunInsight> {
  console.log(`🔍 Computing daily insight for activity ${activityId}...`);

  try {
    // 1. Analyze pacing from splits
    const pacingAnalysis = analyzePacing(activityData.splits_metric || activityData.splits);

    // 2. Analyze heart rate behavior
    const hrBehavior = await analyzeHeartRate(userId, activityId, activityData);

    // 3. Calculate effort and execution score
    const effortAnalysis = calculateEffort(activityData, plannedWorkout, hrBehavior);

    // 4. Check compliance with plan
    const complianceCheck = checkCompliance(activityData, plannedWorkout);

    // 5. Assess risk indicators
    const riskIndicators = assessRisks(activityData, hrBehavior, pacingAnalysis);

    // 6. Generate coaching points
    const coachingPoints = generateCoachingPoints(
      pacingAnalysis,
      hrBehavior,
      effortAnalysis,
      complianceCheck,
      riskIndicators
    );

    const insight: DailyRunInsight = {
      activityId,
      userId,
      runDate: new Date(activityData.start_date),
      pacing: pacingAnalysis,
      hrBehavior,
      effort: effortAnalysis,
      compliance: complianceCheck,
      risks: riskIndicators,
      coachingPoints
    };

    // Store in database
    await storeDailyInsight(insight);

    console.log(`✓ Daily insight computed and stored for activity ${activityId}`);
    return insight;

  } catch (error) {
    console.error(`Error computing daily insight for activity ${activityId}:`, error);
    throw error;
  }
}

/**
 * Analyze Pacing
 *
 * Examines splits to detect:
 * - First half vs second half pace change (positive/negative splits)
 * - Pace consistency (coefficient of variation)
 * - Fastest/slowest kilometers
 * - Fade point detection
 */
function analyzePacing(splits: any[]): DailyRunInsight['pacing'] {
  if (!splits || splits.length < 2) {
    return {
      paceDelta: 0,
      consistency: 1.0,
      splitAnalysis: {
        fastestKm: { km: 1, pace: 0 },
        slowestKm: { km: 1, pace: 0 }
      }
    };
  }

  // Convert speeds to paces (min/km)
  const paces = splits.map((s, idx) => ({
    km: idx + 1,
    pace: speedToPace(s.average_speed || s.velocity_smooth || 0)
  })).filter(p => p.pace > 0); // Filter out zero paces

  if (paces.length === 0) {
    return {
      paceDelta: 0,
      consistency: 1.0,
      splitAnalysis: {
        fastestKm: { km: 1, pace: 0 },
        slowestKm: { km: 1, pace: 0 }
      }
    };
  }

  // First half vs second half comparison
  const halfPoint = Math.floor(paces.length / 2);
  const firstHalfAvg = mean(paces.slice(0, halfPoint).map(p => p.pace));
  const secondHalfAvg = mean(paces.slice(halfPoint).map(p => p.pace));

  // Positive split = slowing down (negative paceDelta)
  // Negative split = speeding up (positive paceDelta)
  const paceDelta = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;

  // Find fade point (where pace drops >5%)
  let fadePoint: number | undefined;
  for (let i = 1; i < paces.length; i++) {
    const paceChange = ((paces[i].pace - paces[i - 1].pace) / paces[i - 1].pace) * 100;
    if (paceChange > 5) {
      fadePoint = i + 1;
      break;
    }
  }

  // Consistency score (1 - coefficient of variation)
  const pacesArray = paces.map(p => p.pace);
  const stdDev = standardDeviation(pacesArray);
  const avgPace = mean(pacesArray);
  const consistency = Math.max(0, Math.min(1, 1 - (stdDev / avgPace)));

  // Find fastest and slowest km
  const sortedPaces = [...paces].sort((a, b) => a.pace - b.pace);

  return {
    paceDelta: Math.round(paceDelta * 10) / 10,
    consistency: Math.round(consistency * 100) / 100,
    splitAnalysis: {
      fastestKm: sortedPaces[0],
      slowestKm: sortedPaces[sortedPaces.length - 1],
      fadePoint
    }
  };
}

/**
 * Analyze Heart Rate Behavior
 *
 * Examines HR data to detect:
 * - Average zone and zone distribution
 * - HR drift over distance
 * - Effort mismatch (HR too high for pace)
 */
async function analyzeHeartRate(
  _userId: number,
  activityId: number,
  activityData: any
): Promise<DailyRunInsight['hrBehavior']> {
  // Get HR zone data from database
  const hrZonesResult = await pool.query(
    `SELECT * FROM activity_hr_zones WHERE activity_id = $1`,
    [activityId]
  );

  const avgHR = activityData.average_heartrate || 0;
  const maxHR = activityData.max_heartrate || 0;

  if (hrZonesResult.rows.length === 0 || !avgHR) {
    return {
      avgZone: 0,
      zoneDrift: 0,
      effortMismatch: false,
      driftRate: 0,
      avgHR,
      maxHR
    };
  }

  const zones = hrZonesResult.rows[0];
  const totalSeconds = zones.zone_1_seconds + zones.zone_2_seconds +
    zones.zone_3_seconds + zones.zone_4_seconds +
    zones.zone_5_seconds;

  if (totalSeconds === 0) {
    return {
      avgZone: 0,
      zoneDrift: 0,
      effortMismatch: false,
      driftRate: 0,
      avgHR,
      maxHR
    };
  }

  // Calculate weighted average zone
  const avgZone = (
    zones.zone_1_seconds * 1 +
    zones.zone_2_seconds * 2 +
    zones.zone_3_seconds * 3 +
    zones.zone_4_seconds * 4 +
    zones.zone_5_seconds * 5
  ) / totalSeconds;

  // Calculate zone drift (how much HR moved between zones)
  const zoneDrift = calculateZoneDrift(zones, totalSeconds);

  // Calculate drift rate (bpm per km)
  const distance = activityData.distance / 1000; // meters to km
  const driftRate = distance > 0 ? (maxHR - avgHR) / distance : 0;

  // Check for effort mismatch (HR too high for easy pace)
  const avgPace = activityData.average_speed ? speedToPace(activityData.average_speed) : 0;
  const effortMismatch = avgZone > 2.5 && avgPace > 5.5; // Zone 3+ on 5:30+ min/km pace

  return {
    avgZone: Math.round(avgZone * 10) / 10,
    zoneDrift: Math.round(zoneDrift),
    effortMismatch,
    driftRate: Math.round(driftRate * 10) / 10,
    avgHR,
    maxHR
  };
}

/**
 * Calculate Effort and Execution Score
 *
 * Determines:
 * - Perceived difficulty based on HR zones
 * - Execution score (plan adherence)
 * - Whether pace was appropriate for workout type
 */
function calculateEffort(
  activityData: any,
  plannedWorkout: any | undefined,
  hrBehavior: DailyRunInsight['hrBehavior']
): DailyRunInsight['effort'] {
  // Determine perceived difficulty based on HR zone
  let perceivedDifficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';
  if (hrBehavior.avgZone < 2.5) perceivedDifficulty = 'easy';
  else if (hrBehavior.avgZone < 3.5) perceivedDifficulty = 'moderate';
  else if (hrBehavior.avgZone < 4.5) perceivedDifficulty = 'hard';
  else perceivedDifficulty = 'very_hard';

  // Calculate execution score (if planned workout exists)
  let executionScore = 100;
  let paceAppropriate = true;

  if (plannedWorkout) {
    // Distance match
    const targetDistance = plannedWorkout.target_distance_meters || plannedWorkout.distance_meters;
    const actualDistance = activityData.distance;

    let distanceMatch = 100;
    if (targetDistance) {
      const distanceDeviation = Math.abs((actualDistance - targetDistance) / targetDistance);
      distanceMatch = Math.max(0, 100 - (distanceDeviation * 100));
    }

    // Pace match (if specified)
    let paceMatch = 100;
    if (plannedWorkout.target_pace_avg) {
      const actualPace = speedToPace(activityData.average_speed);
      const targetPace = plannedWorkout.target_pace_avg;
      const paceDeviation = Math.abs((actualPace - targetPace) / targetPace);
      paceMatch = Math.max(0, 100 - (paceDeviation * 100));
      paceAppropriate = paceDeviation < 0.05; // Within 5%
    }

    executionScore = (distanceMatch * 0.5 + paceMatch * 0.5);
  }

  return {
    perceivedDifficulty,
    executionScore: Math.round(Math.max(0, Math.min(100, executionScore))),
    paceAppropriate
  };
}

/**
 * Check Compliance with Planned Workout
 *
 * Compares actual activity to planned workout:
 * - Distance deviation
 * - Pace deviation
 * - Modifications made
 */
function checkCompliance(
  activityData: any,
  plannedWorkout?: any
): DailyRunInsight['compliance'] {
  if (!plannedWorkout) {
    return {
      completedAsPlanned: true,
      distanceDeviation: 0,
      paceDeviation: 0,
      modifications: []
    };
  }

  const targetDistance = plannedWorkout.target_distance_meters || plannedWorkout.distance_meters;
  const actualDistance = activityData.distance;

  const distanceDeviation = targetDistance
    ? ((actualDistance - targetDistance) / targetDistance * 100)
    : 0;

  const actualPace = speedToPace(activityData.average_speed);
  const paceDeviation = plannedWorkout.target_pace_avg
    ? ((actualPace - plannedWorkout.target_pace_avg) / plannedWorkout.target_pace_avg * 100)
    : 0;

  const completedAsPlanned =
    Math.abs(distanceDeviation) < 10 &&
    Math.abs(paceDeviation) < 10;

  const modifications: string[] = [];
  if (Math.abs(distanceDeviation) >= 10) {
    modifications.push(distanceDeviation > 0 ? 'Extended distance' : 'Shortened distance');
  }
  if (Math.abs(paceDeviation) >= 10) {
    modifications.push(paceDeviation > 0 ? 'Slowed pace' : 'Quickened pace');
  }

  return {
    completedAsPlanned,
    distanceDeviation: Math.round(distanceDeviation * 10) / 10,
    paceDeviation: Math.round(paceDeviation * 10) / 10,
    modifications
  };
}

/**
 * Assess Risk Indicators
 *
 * Identifies potential risks:
 * - Injury risk based on pace fade and HR drift
 * - Overtraining signals
 * - Recovery needs
 */
function assessRisks(
  _activityData: any,
  hrBehavior: DailyRunInsight['hrBehavior'],
  pacing: DailyRunInsight['pacing']
): DailyRunInsight['risks'] {
  const signals: string[] = [];
  let injuryRisk: 'low' | 'moderate' | 'high' = 'low';
  let recoveryNeeded = false;

  // Check for significant pace fade (positive split >10%)
  if (pacing.paceDelta < -10) {
    signals.push('Significant pace fade in second half');
    injuryRisk = 'moderate';
  }

  // Check for HR drift
  if (hrBehavior.driftRate > 5) {
    signals.push('High HR drift (>5 bpm/km)');
    recoveryNeeded = true;
  }

  // Check for effort mismatch
  if (hrBehavior.effortMismatch) {
    signals.push('HR too high for pace (effort mismatch)');
    recoveryNeeded = true;
  }

  // Check for very hard effort
  if (hrBehavior.avgZone > 4.0) {
    signals.push('Very high intensity (Zone 4-5)');
    recoveryNeeded = true;
    injuryRisk = 'moderate';
  }

  // High injury risk if multiple signals
  if (signals.length >= 3) {
    injuryRisk = 'high';
  }

  return {
    injuryRisk,
    overtrainingSignals: signals,
    recoveryNeeded
  };
}

/**
 * Generate Coaching Points
 *
 * Creates specific, actionable feedback:
 * - Strengths (what went well)
 * - Improvements (what to address)
 * - Next workout adjustment (specific guidance)
 */
function generateCoachingPoints(
  pacing: DailyRunInsight['pacing'],
  hrBehavior: DailyRunInsight['hrBehavior'],
  effort: DailyRunInsight['effort'],
  compliance: DailyRunInsight['compliance'],
  _risks: DailyRunInsight['risks']
): DailyRunInsight['coachingPoints'] {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let nextWorkoutAdjustment: string | undefined;

  // Identify strengths
  if (pacing.paceDelta > 0) {
    strengths.push(`Excellent negative split: ${Math.abs(pacing.paceDelta).toFixed(1)}% faster in second half`);
  }
  if (pacing.consistency > 0.9) {
    strengths.push(`Outstanding pace consistency (${(pacing.consistency * 100).toFixed(0)}% score)`);
  }
  if (compliance.completedAsPlanned) {
    strengths.push('Completed exactly as planned');
  }
  if (hrBehavior.avgZone >= 1.8 && hrBehavior.avgZone <= 2.2 && effort.perceivedDifficulty === 'easy') {
    strengths.push('Perfect Zone 2 execution for easy run');
  }
  if (hrBehavior.driftRate < 2) {
    strengths.push('Excellent HR control (minimal drift)');
  }

  // Identify improvements
  if (pacing.paceDelta < -5) {
    const fadePercent = Math.abs(pacing.paceDelta).toFixed(1);
    improvements.push(`Pace faded ${fadePercent}% - start slower next time`);

    if (pacing.splitAnalysis.fastestKm.pace > 0) {
      const adjustedPace = (pacing.splitAnalysis.fastestKm.pace + 0.15).toFixed(2);
      nextWorkoutAdjustment = `For next easy run: Start at ${adjustedPace} min/km (15 sec/km slower than fastest km)`;
    }
  }

  if (hrBehavior.effortMismatch) {
    improvements.push('HR too high for easy pace - slow down to stay in Zone 2');
    nextWorkoutAdjustment = 'Target Zone 2 (120-140 bpm). If HR exceeds 145, SLOW DOWN immediately';
  }

  if (pacing.consistency < 0.75) {
    improvements.push(`Inconsistent pacing (${(pacing.consistency * 100).toFixed(0)}% score) - aim for even splits`);
  }

  if (!compliance.completedAsPlanned && compliance.modifications.length > 0) {
    improvements.push(`Modified workout: ${compliance.modifications.join(', ')}`);
  }

  if (hrBehavior.driftRate > 5) {
    improvements.push(`High HR drift (${hrBehavior.driftRate.toFixed(1)} bpm/km) - suggests fatigue or pacing issue`);
  }

  // Default if no specific improvements identified
  if (improvements.length === 0 && strengths.length > 0) {
    improvements.push('Solid execution overall - maintain this consistency');
  }

  return {
    strengths,
    improvements,
    nextWorkoutAdjustment
  };
}

/**
 * Store Daily Insight in Database
 */
async function storeDailyInsight(insight: DailyRunInsight): Promise<void> {
  await pool.query(
    `INSERT INTO daily_run_insights
     (user_id, activity_id, run_date, pacing_analysis, hr_behavior,
      effort_analysis, compliance_check, risk_indicators, coaching_points)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (activity_id)
     DO UPDATE SET
       pacing_analysis = EXCLUDED.pacing_analysis,
       hr_behavior = EXCLUDED.hr_behavior,
       effort_analysis = EXCLUDED.effort_analysis,
       compliance_check = EXCLUDED.compliance_check,
       risk_indicators = EXCLUDED.risk_indicators,
       coaching_points = EXCLUDED.coaching_points`,
    [
      insight.userId,
      insight.activityId,
      insight.runDate,
      JSON.stringify(insight.pacing),
      JSON.stringify(insight.hrBehavior),
      JSON.stringify(insight.effort),
      JSON.stringify(insight.compliance),
      JSON.stringify(insight.risks),
      JSON.stringify(insight.coachingPoints)
    ]
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert speed (m/s) to pace (min/km)
 */
function speedToPace(speed: number): number {
  if (speed === 0) return 0;
  return 1000 / (speed * 60); // m/s to min/km
}

/**
 * Calculate mean of an array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate zone drift (how much HR moved between zones)
 */
function calculateZoneDrift(zones: any, totalSeconds: number): number {
  if (totalSeconds === 0) return 0;

  // Calculate percentage in each zone
  const zonePercentages = [
    zones.zone_1_seconds / totalSeconds,
    zones.zone_2_seconds / totalSeconds,
    zones.zone_3_seconds / totalSeconds,
    zones.zone_4_seconds / totalSeconds,
    zones.zone_5_seconds / totalSeconds
  ];

  // Find max percentage (primary zone)
  const maxZonePercent = Math.max(...zonePercentages);

  // Drift is inverse of primary zone dominance
  // If 90% in one zone, drift is 10%
  // If evenly distributed, drift is high
  return Math.round((1 - maxZonePercent) * 100);
}
