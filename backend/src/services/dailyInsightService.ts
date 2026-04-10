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
 * - Coaching points with specific guidance (personality-adjusted)
 */

import pool from '../config/database';
import { DailyRunInsight } from '../types/insights';
import { calculateExecutionScore, ExecutionScore } from './executionScoringService';

/**
 * Coach Style Type
 */
type CoachStyle = 'strict' | 'supportive' | 'analytical' | 'motivational';

/**
 * HR Zone Configuration
 */
interface HRZones {
  zone1Max: number;
  zone2Max: number;
  zone3Max: number;
  zone4Max: number;
  zone5Max: number;
}

/**
 * Fetch user's custom HR zones from profile
 */
async function getUserHRZones(userId: number): Promise<HRZones> {
  const result = await pool.query(
    `SELECT hr_zone_1_max, hr_zone_2_max, hr_zone_3_max, hr_zone_4_max, hr_zone_5_max
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0 || !result.rows[0].hr_zone_1_max) {
    // Return default zones if not customized
    return {
      zone1Max: 120,
      zone2Max: 140,
      zone3Max: 160,
      zone4Max: 175,
      zone5Max: 220
    };
  }

  return {
    zone1Max: result.rows[0].hr_zone_1_max,
    zone2Max: result.rows[0].hr_zone_2_max,
    zone3Max: result.rows[0].hr_zone_3_max,
    zone4Max: result.rows[0].hr_zone_4_max,
    zone5Max: result.rows[0].hr_zone_5_max
  };
}

/**
 * Fetch user's coach style preference
 */
async function getUserCoachStyle(userId: number): Promise<CoachStyle> {
  const result = await pool.query(
    `SELECT coach_style FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0 || !result.rows[0].coach_style) {
    return 'supportive'; // Default
  }

  return result.rows[0].coach_style as CoachStyle;
}

/**
 * Convert HR (bpm) to zone number using custom zones
 */
function hrToZone(hr: number, zones: HRZones): number {
  if (hr < zones.zone1Max) return 1;
  if (hr < zones.zone2Max) return 2;
  if (hr < zones.zone3Max) return 3;
  if (hr < zones.zone4Max) return 4;
  return 5;
}

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
    // Fetch user's custom HR zones and coach style
    const hrZones = await getUserHRZones(userId);
    const coachStyle = await getUserCoachStyle(userId);

    // 1. Analyze pacing from splits
    // NOTE: Strava API typically does not provide per-km splits, so this will use aggregate data
    const pacingAnalysis = analyzePacing(activityData.splits_metric || activityData.splits);

    // 2. Analyze heart rate behavior
    const hrBehavior = await analyzeHeartRate(userId, activityId, activityData, hrZones);

    // 3. Calculate effort and execution score (with proper HR zone compliance)
    const effortAnalysis = calculateEffortWithHRZones(
      activityData,
      plannedWorkout,
      hrBehavior,
      hrZones,
      pacingAnalysis.consistency
    );

    // 4. Check compliance with plan (passing actual HR zone for comparison)
    const complianceCheck = checkCompliance(activityData, plannedWorkout, hrBehavior.avgZone);

    // 5. Assess risk indicators
    const riskIndicators = assessRisks(activityData, hrBehavior, pacingAnalysis);

    // 6. Generate coaching points (personality-adjusted)
    const coachingPoints = generateCoachingPoints(
      pacingAnalysis,
      hrBehavior,
      effortAnalysis,
      complianceCheck,
      riskIndicators,
      coachStyle
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
 * NOTE: Strava API typically does not provide per-kilometer splits,
 * so this function will usually return default values.
 *
 * If splits are available, examines them to detect:
 * - First half vs second half pace change (positive/negative splits)
 * - Pace consistency (coefficient of variation)
 * - Fastest/slowest kilometers
 * - Fade point detection
 */
function analyzePacing(splits: any[]): DailyRunInsight['pacing'] {
  // Strava usually doesn't provide splits - return safe defaults
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
  activityData: any,
  hrZones: HRZones
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

  const activityZoneData = hrZonesResult.rows[0];
  const totalSeconds = activityZoneData.zone_1_seconds + activityZoneData.zone_2_seconds +
    activityZoneData.zone_3_seconds + activityZoneData.zone_4_seconds +
    activityZoneData.zone_5_seconds;

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
    activityZoneData.zone_1_seconds * 1 +
    activityZoneData.zone_2_seconds * 2 +
    activityZoneData.zone_3_seconds * 3 +
    activityZoneData.zone_4_seconds * 4 +
    activityZoneData.zone_5_seconds * 5
  ) / totalSeconds;

  // Calculate zone drift (how much HR moved between zones)
  const zoneDrift = calculateZoneDrift(activityZoneData, totalSeconds);

  // Calculate drift rate (bpm per km)
  const distance = activityData.distance / 1000; // meters to km
  const driftRate = distance > 0 ? (maxHR - avgHR) / distance : 0;

  // Check for effort mismatch (HR too high for easy pace)
  // If average HR is in Zone 3+ but pace is slow (>5:30/km), that's a mismatch
  const avgPace = activityData.average_speed ? speedToPace(activityData.average_speed) : 0;
  const effortMismatch = avgHR > hrZones.zone2Max && avgPace > 5.5; // HR above Zone 2 on 5:30+ min/km pace

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
 * - Execution score (plan adherence) using proper scoring with HR zone compliance
 * - Whether pace was appropriate for workout type
 */
function calculateEffortWithHRZones(
  activityData: any,
  plannedWorkout: any | undefined,
  hrBehavior: DailyRunInsight['hrBehavior'],
  hrZones: HRZones,
  pacingConsistency: number = 1.0
): DailyRunInsight['effort'] {
  // Determine perceived difficulty based on HR zone
  let perceivedDifficulty: 'easy' | 'moderate' | 'hard' | 'very_hard';
  if (hrBehavior.avgZone < 2.5) perceivedDifficulty = 'easy';
  else if (hrBehavior.avgZone < 3.5) perceivedDifficulty = 'moderate';
  else if (hrBehavior.avgZone < 4.5) perceivedDifficulty = 'hard';
  else perceivedDifficulty = 'very_hard';

  // Default score if no planned workout
  let executionScore = 100;
  let paceAppropriate = true;

  if (plannedWorkout) {
    // Use the proper execution scoring service which includes:
    // - Pace compliance (40%)
    // - Distance compliance (30%)
    // - HR zone compliance (20%)
    // - Consistency (10%)
    const scoreResult: ExecutionScore = calculateExecutionScore(
      {
        distance: activityData.distance,
        average_speed: activityData.average_speed,
        average_heartrate: activityData.average_heartrate,
        splits: activityData.splits_metric || activityData.splits
      },
      {
        target_distance_meters: plannedWorkout.target_distance_meters || plannedWorkout.distance_meters,
        target_pace_min: plannedWorkout.target_pace_min,
        target_pace_max: plannedWorkout.target_pace_max,
        target_hr_zone: plannedWorkout.target_hr_zone
      },
      {
        zone1Max: hrZones.zone1Max,
        zone2Max: hrZones.zone2Max,
        zone3Max: hrZones.zone3Max,
        zone4Max: hrZones.zone4Max
      },
      pacingConsistency
    );

    executionScore = scoreResult.overall;

    // Check if pace was appropriate (using the pace score from the result)
    paceAppropriate = scoreResult.paceScore >= 80;
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
  plannedWorkout?: any,
  actualZone?: number
): DailyRunInsight['compliance'] {
  if (!plannedWorkout) {
    return {
      completedAsPlanned: true,
      distanceDeviation: 0,
      paceDeviation: 0,
      hrZoneDeviation: 0,
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

  // Calculate HR zone deviation (negative = too easy, positive = too hard)
  const targetZone = plannedWorkout.target_hr_zone;
  const hrZoneDeviation = (targetZone && actualZone)
    ? Math.round(actualZone) - targetZone
    : 0;

  const completedAsPlanned =
    Math.abs(distanceDeviation) < 10 &&
    Math.abs(paceDeviation) < 10 &&
    Math.abs(hrZoneDeviation) <= 1; // Allow 1 zone difference

  const modifications: string[] = [];
  if (Math.abs(distanceDeviation) >= 10) {
    modifications.push(distanceDeviation > 0 ? 'Extended distance' : 'Shortened distance');
  }
  if (Math.abs(paceDeviation) >= 10) {
    modifications.push(paceDeviation > 0 ? 'Slowed pace' : 'Quickened pace');
  }
  if (Math.abs(hrZoneDeviation) >= 2) {
    const zoneDirection = hrZoneDeviation < 0 ? 'easier' : 'harder';
    modifications.push(`HR ${Math.abs(hrZoneDeviation)} zones ${zoneDirection} than target`);
  }

  return {
    completedAsPlanned,
    distanceDeviation: Math.round(distanceDeviation * 10) / 10,
    paceDeviation: Math.round(paceDeviation * 10) / 10,
    hrZoneDeviation,
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
 * Personality-Adjusted Message Templates
 *
 * Each coach personality has different tones for feedback:
 * - strict: Direct, demanding, no sugarcoating
 * - supportive: Warm, encouraging, celebrates progress
 * - analytical: Data-focused, technical, precise
 * - motivational: Energizing, goal-focused, inspiring
 */
const PERSONALITY_MESSAGES = {
  // Strength messages
  negativeSplit: {
    strict: (delta: string) => `Negative split of ${delta}% - this is the discipline that builds champions.`,
    supportive: (delta: string) => `Fantastic negative split (${delta}% faster in the second half)! You're really developing race-ready pacing.`,
    analytical: (delta: string) => `Negative split achieved: ${delta}% pace improvement in second half. Optimal execution pattern for endurance events.`,
    motivational: (delta: string) => `You crushed that negative split at ${delta}%! This is exactly how you'll finish strong on race day!`
  },
  paceConsistency: {
    strict: (score: string) => `${score}% pace consistency - this is what I expect. Maintain this standard.`,
    supportive: (score: string) => `Amazing pace consistency at ${score}%! You're developing incredible control.`,
    analytical: (score: string) => `Pace consistency coefficient: ${score}%. This is within elite-level variance parameters.`,
    motivational: (score: string) => `${score}% consistency - you're running like a metronome! This control will carry you to your goal!`
  },
  completedAsPlanned: {
    strict: 'Workout completed as prescribed. This is the baseline expectation.',
    supportive: 'Completed exactly as planned - you\'re building fantastic discipline!',
    analytical: 'Plan compliance: 100%. Training load executed precisely as prescribed.',
    motivational: 'You nailed it! Every workout like this brings you closer to your dream finish time!'
  },
  perfectZone2: {
    strict: 'Zone 2 execution was correct. This is how easy runs should always be done.',
    supportive: 'Perfect Zone 2 execution! Your aerobic base is really developing.',
    analytical: 'HR zone distribution optimal: Avg zone 2.0 ± 0.2. Aerobic adaptation stimulus maximized.',
    motivational: 'That\'s how you build an unstoppable engine! Perfect Zone 2 work!'
  },
  hrControl: {
    strict: 'Minimal HR drift shows proper pacing discipline.',
    supportive: 'Excellent heart rate control! Your body is responding beautifully to the training.',
    analytical: 'HR drift rate <2 bpm/km indicates strong cardiovascular efficiency and appropriate pacing.',
    motivational: 'Your HR control was textbook! This efficiency will pay dividends on race day!'
  },

  // Improvement messages
  paceFade: {
    strict: (fade: string) => `Unacceptable: Pace faded ${fade}% in the second half. You went out too fast. Fix this.`,
    supportive: (fade: string) => `Your pace faded ${fade}% in the second half - next time, try starting a bit more conservatively. You've got this!`,
    analytical: (fade: string) => `Pace degradation of ${fade}% detected in second half. Data suggests glycogen depletion or suboptimal pacing strategy.`,
    motivational: (fade: string) => `You gave it everything but faded ${fade}% - let's bank that energy for a stronger finish next time!`
  },
  effortMismatch: {
    strict: 'Your HR was too high for an easy pace. Slow down immediately. Easy means EASY.',
    supportive: 'Your heart rate crept a bit high for easy pace - try slowing down to stay in Zone 2. It takes practice!',
    analytical: 'Effort mismatch detected: HR exceeded Zone 2 threshold at easy pace. Recommend 10-15s/km pace reduction.',
    motivational: 'Your engine was revving too high for an easy day - save that fire for the hard sessions!'
  },
  inconsistentPacing: {
    strict: (score: string) => `${score}% pacing consistency is below standard. You need to develop better pace awareness.`,
    supportive: (score: string) => `Your pacing was a bit variable at ${score}% - practicing even splits will help you on race day!`,
    analytical: (score: string) => `Pacing variability: ${score}% consistency score. Recommend interval pacing drills to improve distribution.`,
    motivational: (score: string) => `Let's work on that pacing rhythm - ${score}% today means room to grow even stronger!`
  },
  modifiedWorkout: {
    strict: (mods: string) => `Workout was modified: ${mods}. Stick to the plan unless injured.`,
    supportive: (mods: string) => `You made some adjustments today (${mods}) - that's okay, life happens! Let's get back on track next time.`,
    analytical: (mods: string) => `Deviation from plan detected: ${mods}. Recommend logging reason for training load accuracy.`,
    motivational: (mods: string) => `You adapted today (${mods}) - flexibility is part of the journey. Eyes on the goal!`
  },
  hrDrift: {
    strict: (drift: string) => `${drift} bpm/km HR drift indicates you're not managing effort properly. Address this.`,
    supportive: (drift: string) => `Your HR drifted ${drift} bpm/km which suggests some fatigue - make sure you're recovering well!`,
    analytical: (drift: string) => `HR drift rate: ${drift} bpm/km exceeds threshold. Indicates potential fatigue, dehydration, or heat stress.`,
    motivational: (drift: string) => `${drift} bpm/km drift shows you were working hard - let's make sure you recover to crush the next one!`
  },
  solidExecution: {
    strict: 'Acceptable execution. Maintain this standard.',
    supportive: 'Solid execution overall - keep up the great work!',
    analytical: 'No significant deviations detected. Training stimulus delivered as intended.',
    motivational: 'Great job staying on track! Every consistent run builds your fitness!'
  },
  hrZoneMismatch: {
    strict: (actual: string, target: string) => `You ran in Zone ${actual} when the target was Zone ${target}. Follow the prescribed intensity.`,
    supportive: (actual: string, target: string) => `Your average was Zone ${actual} but the target was Zone ${target} - try to adjust your intensity to match the plan next time!`,
    analytical: (actual: string, target: string) => `HR zone deviation detected: Actual Zone ${actual} vs Target Zone ${target}. Training stimulus did not match prescription.`,
    motivational: (actual: string, target: string) => `You were in Zone ${actual} instead of Zone ${target} - matching the right intensity helps you get the most from each workout!`
  },

  // Next workout adjustments
  fadeAdjustment: {
    strict: 'NEXT RUN: Start 15 seconds/km slower. No excuses.',
    supportive: 'For next easy run: Try starting 10-15 seconds per km slower to finish strong!',
    analytical: 'Recommendation: Reduce initial pace by 10-15s/km to prevent glycogen depletion and optimize training stimulus.',
    motivational: 'Next run: Hold back early and unleash that power in the second half!'
  },
  hrAdjustment: {
    strict: 'NEXT RUN: Do not exceed Zone 2. If HR goes over 145, slow down immediately.',
    supportive: 'Next time: If your HR goes over 145, take a little walk break to bring it back down. No shame in that!',
    analytical: 'Protocol: Target Zone 2 (HR 120-140 bpm). Implement immediate pace reduction if HR exceeds upper threshold.',
    motivational: 'Keep that HR in check next time - save your high-intensity heart for the big workouts!'
  }
};

/**
 * Generate Coaching Points
 *
 * Creates specific, actionable feedback adjusted to coach personality:
 * - Strengths (what went well)
 * - Improvements (what to address)
 * - Next workout adjustment (specific guidance)
 */
function generateCoachingPoints(
  pacing: DailyRunInsight['pacing'],
  hrBehavior: DailyRunInsight['hrBehavior'],
  effort: DailyRunInsight['effort'],
  compliance: DailyRunInsight['compliance'],
  _risks: DailyRunInsight['risks'],
  coachStyle: CoachStyle = 'supportive'
): DailyRunInsight['coachingPoints'] {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let nextWorkoutAdjustment: string | undefined;

  const msg = PERSONALITY_MESSAGES;

  // Identify strengths
  if (pacing.paceDelta > 0) {
    const delta = Math.abs(pacing.paceDelta).toFixed(1);
    strengths.push(msg.negativeSplit[coachStyle](delta));
  }
  if (pacing.consistency > 0.9) {
    const score = (pacing.consistency * 100).toFixed(0);
    strengths.push(msg.paceConsistency[coachStyle](score));
  }
  if (compliance.completedAsPlanned) {
    strengths.push(msg.completedAsPlanned[coachStyle]);
  }
  if (hrBehavior.avgZone >= 1.8 && hrBehavior.avgZone <= 2.2 && effort.perceivedDifficulty === 'easy') {
    strengths.push(msg.perfectZone2[coachStyle]);
  }
  if (hrBehavior.driftRate < 2) {
    strengths.push(msg.hrControl[coachStyle]);
  }

  // Identify improvements
  if (pacing.paceDelta < -5) {
    const fadePercent = Math.abs(pacing.paceDelta).toFixed(1);
    improvements.push(msg.paceFade[coachStyle](fadePercent));
    nextWorkoutAdjustment = msg.fadeAdjustment[coachStyle];
  }

  if (hrBehavior.effortMismatch) {
    improvements.push(msg.effortMismatch[coachStyle]);
    nextWorkoutAdjustment = msg.hrAdjustment[coachStyle];
  }

  if (pacing.consistency < 0.75) {
    const score = (pacing.consistency * 100).toFixed(0);
    improvements.push(msg.inconsistentPacing[coachStyle](score));
  }

  if (!compliance.completedAsPlanned && compliance.modifications.length > 0) {
    const mods = compliance.modifications.join(', ');
    improvements.push(msg.modifiedWorkout[coachStyle](mods));
  }

  if (hrBehavior.driftRate > 5) {
    const drift = hrBehavior.driftRate.toFixed(1);
    improvements.push(msg.hrDrift[coachStyle](drift));
  }

  // Check for HR zone deviation from target
  if (compliance.hrZoneDeviation && Math.abs(compliance.hrZoneDeviation) >= 2) {
    const actualZone = Math.round(hrBehavior.avgZone).toString();
    // Calculate target zone from actual zone and deviation
    const targetZone = (Math.round(hrBehavior.avgZone) - compliance.hrZoneDeviation).toString();
    improvements.push(msg.hrZoneMismatch[coachStyle](actualZone, targetZone));
  }

  // Default if no specific improvements identified
  if (improvements.length === 0 && strengths.length > 0) {
    improvements.push(msg.solidExecution[coachStyle]);
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

/**
 * Recompute Daily Insight for an Activity
 *
 * Called when a planned workout is modified or when we need to refresh insights.
 * Re-fetches the activity data and linked workout, then recomputes all insights.
 */
export async function recomputeDailyInsight(
  userId: number,
  activityId: number
): Promise<DailyRunInsight | null> {
  console.log(`🔄 Recomputing daily insight for activity ${activityId}...`);

  try {
    // Fetch activity data
    const activityResult = await pool.query(
      `SELECT * FROM activities WHERE id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    if (activityResult.rows.length === 0) {
      console.log(`❌ Activity ${activityId} not found for user ${userId}`);
      return null;
    }

    const activity = activityResult.rows[0];

    // Convert stored activity to the format expected by computeDailyInsight
    const activityData = {
      id: activity.strava_activity_id,
      distance: activity.distance_meters,
      moving_time: activity.moving_time_seconds,
      average_speed: activity.average_speed,
      average_heartrate: activity.average_heartrate,
      max_heartrate: activity.max_heartrate,
      start_date: activity.start_date,
      type: activity.sport_type,
      splits_metric: activity.splits_metric,
      splits: activity.splits_metric || activity.splits_standard
    };

    // Fetch linked planned workout (if any)
    const workoutResult = await pool.query(
      `SELECT pw.*
       FROM planned_workouts pw
       JOIN training_plans tp ON pw.training_plan_id = tp.id
       WHERE tp.user_id = $1
         AND tp.is_active = true
         AND (
           pw.completed_activity_id = $2
           OR (
             pw.scheduled_date = DATE($3 AT TIME ZONE COALESCE($4, 'UTC'))
             AND pw.completed_activity_id IS NULL
           )
         )
       ORDER BY
         CASE WHEN pw.completed_activity_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId, activityId, activity.start_date, activity.timezone]
    );

    const plannedWorkout = workoutResult.rows[0] || null;

    // Compute and store the updated insight
    return await computeDailyInsight(userId, activityId, activityData, plannedWorkout);
  } catch (error) {
    console.error(`Error recomputing daily insight for activity ${activityId}:`, error);
    throw error;
  }
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
