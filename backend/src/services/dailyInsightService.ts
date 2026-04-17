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
import { RollingBaseline, RunnerType } from '../types/models';
import { calculateExecutionScore, ExecutionScore } from './executionScoringService';
import { get4WeekRollingBaseline } from './baselineMetricsService';

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
 * Fetch user's runner type from profile
 */
async function getUserRunnerType(userId: number): Promise<RunnerType | null> {
  const result = await pool.query(
    `SELECT runner_type FROM user_profiles WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0 || !result.rows[0].runner_type) {
    return null;
  }

  return result.rows[0].runner_type as RunnerType;
}

/**
 * Check if user has an active training plan
 */
async function hasActivePlan(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM training_plans WHERE user_id = $1 AND is_active = true LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
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
    const runnerType = await getUserRunnerType(userId);
    const userHasPlan = await hasActivePlan(userId);

    // 1. Analyze pacing from splits
    // Prefer our processed_splits (computed from Strava streams) over Strava's splits_metric
    const pacingAnalysis = activityData.processed_splits?.splits
      ? analyzeProcessedSplits(activityData.processed_splits)
      : analyzePacing(activityData.splits_metric || activityData.splits);

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

    // 4. Assess risk indicators (always needed)
    const riskIndicators = assessRisks(activityData, hrBehavior, pacingAnalysis);

    let complianceCheck: DailyRunInsight['compliance'];
    let coachingPoints: DailyRunInsight['coachingPoints'];

    // Branch based on whether user has a plan or not
    if (plannedWorkout) {
      // 5a. Check compliance with plan (passing actual HR zone for comparison)
      complianceCheck = checkCompliance(activityData, plannedWorkout, hrBehavior.avgZone);

      // 5b. Evaluate workout execution against planned structure (for intervals, tempo, etc.)
      const workoutExecution = evaluateWorkoutExecution(
        activityData.processed_splits,
        plannedWorkout
      );

      // 6a. Generate coaching points (personality-adjusted, plan-based, structure-aware)
      coachingPoints = generateCoachingPoints(
        pacingAnalysis,
        hrBehavior,
        effortAnalysis,
        complianceCheck,
        riskIndicators,
        coachStyle,
        workoutExecution
      );
    } else if (!userHasPlan) {
      // 5b. For plan-less users, compare against baseline
      const baseline = await get4WeekRollingBaseline(userId);
      const activityDistanceKm = (activityData.distance || 0) / 1000;

      console.log(`📊 Plan-less user insight: Using baseline comparison`);
      console.log(`   Baseline avg weekly: ${baseline?.avgDistanceKm || 'N/A'} km`);
      console.log(`   This activity: ${activityDistanceKm.toFixed(1)} km`);
      console.log(`   Runner type: ${runnerType || 'unset'}`);

      complianceCheck = generateBaselineComparison(activityData, baseline);

      // 6b. Generate baseline-aware coaching points
      coachingPoints = generateBaselineCoachingPoints(
        pacingAnalysis,
        hrBehavior,
        effortAnalysis,
        baseline,
        activityDistanceKm,
        runnerType,
        coachStyle
      );
    } else {
      // User has plan but this activity doesn't match a planned workout
      complianceCheck = checkCompliance(activityData, undefined, hrBehavior.avgZone);

      coachingPoints = generateCoachingPoints(
        pacingAnalysis,
        hrBehavior,
        effortAnalysis,
        complianceCheck,
        riskIndicators,
        coachStyle
      );
    }

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

// ============================================================================
// Workout Structure Parsing (for interval-aware evaluation)
// ============================================================================

interface WorkoutSegment {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'easy';
  distanceKm: number;
  targetPaceMin?: number;  // min/km (min)
  targetPaceMax?: number;  // min/km (max, slower)
  repetitions?: number;
}

interface ParsedWorkoutStructure {
  isStructured: boolean;
  workoutType: string;
  segments: WorkoutSegment[];
  totalIntervals: number;
  intervalTargetPace?: { min: number; max: number };
  easyTargetPace?: { min: number; max: number };
}

/**
 * Parse workout structure from either:
 * 1. Structured `intervals` JSONB field (preferred - explicit data)
 * 2. Text `description` field (fallback - regex parsing)
 *
 * Examples of description parsing:
 * - "1.6km Easy; 3 x 2M fast (400m rec); 1.6km Easy"
 * - "10km Easy"
 * - "6x800m @ 3:30/km with 400m jog"
 */
function parseWorkoutStructure(
  plannedWorkout: any
): ParsedWorkoutStructure {
  const description = plannedWorkout?.description || '';
  const workoutType = plannedWorkout?.workout_type || 'easy';
  const targetPaceMin = plannedWorkout?.target_pace_min; // min/km (fast pace)
  const targetPaceMax = plannedWorkout?.target_pace_max; // min/km (slow/easy pace)
  const intervalsJson = plannedWorkout?.intervals; // Structured interval data

  // Default result for non-structured workouts
  const defaultResult: ParsedWorkoutStructure = {
    isStructured: false,
    workoutType,
    segments: [],
    totalIntervals: 0
  };

  // Check if this is an interval/structured workout
  const hardWorkoutTypes = ['intervals', 'interval', 'tempo', 'speed', 'threshold'];
  const isHardWorkout = hardWorkoutTypes.includes(workoutType.toLowerCase());

  if (!isHardWorkout && workoutType !== 'long_run') {
    return defaultResult;
  }

  // PRIORITY 1: Use structured intervals JSONB if available
  if (intervalsJson && Array.isArray(intervalsJson) && intervalsJson.length > 0) {
    console.log(`📊 Using structured intervals data for workout evaluation`);
    const segments: WorkoutSegment[] = [];
    let totalIntervals = 0;

    for (const interval of intervalsJson) {
      // Parse interval structure from JSONB
      // Expected format: { type: 'interval'|'recovery'|'warmup'|'cooldown', distance_meters, pace_min, pace_max, reps }
      const segmentType = interval.type?.toLowerCase() || 'interval';
      const distanceKm = (interval.distance_meters || interval.distance || 0) / 1000;
      const reps = interval.reps || interval.repetitions || 1;

      if (segmentType === 'interval' || segmentType === 'fast' || segmentType === 'hard') {
        totalIntervals += reps;
        segments.push({
          type: 'interval',
          distanceKm,
          repetitions: reps,
          targetPaceMin: interval.pace_min || targetPaceMin,
          targetPaceMax: interval.pace_max || (interval.pace_min ? interval.pace_min + 0.25 : undefined)
        });
      } else if (segmentType === 'recovery' || segmentType === 'jog' || segmentType === 'rest') {
        segments.push({
          type: 'recovery',
          distanceKm,
          repetitions: reps > 1 ? reps - 1 : 1,
          targetPaceMin: targetPaceMax,
          targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
        });
      } else if (segmentType === 'warmup' || segmentType === 'warm-up') {
        segments.push({
          type: 'warmup',
          distanceKm,
          targetPaceMin: targetPaceMax,
          targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
        });
      } else if (segmentType === 'cooldown' || segmentType === 'cool-down') {
        segments.push({
          type: 'cooldown',
          distanceKm,
          targetPaceMin: targetPaceMax,
          targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
        });
      } else {
        // Default to easy segment
        segments.push({
          type: 'easy',
          distanceKm,
          targetPaceMin: targetPaceMax,
          targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
        });
      }
    }

    if (segments.length > 0) {
      // Compute interval target pace from segments or fallback to workout targets
      let intervalMin: number | undefined;
      let intervalMax: number | undefined;
      if (targetPaceMin && !isNaN(targetPaceMin)) {
        intervalMin = targetPaceMin;
        intervalMax = (targetPaceMax && !isNaN(targetPaceMax) && targetPaceMax > targetPaceMin)
          ? targetPaceMax
          : targetPaceMin + 0.5;
      }

      return {
        isStructured: true,
        workoutType,
        segments,
        totalIntervals,
        intervalTargetPace: intervalMin ? { min: intervalMin, max: intervalMax! } : undefined,
        easyTargetPace: targetPaceMax && !isNaN(targetPaceMax) ? { min: targetPaceMax - 0.5, max: targetPaceMax + 0.5 } : undefined
      };
    }
  }

  // PRIORITY 2: Fall back to parsing description text
  if (!description) {
    return defaultResult;
  }

  // Parse interval patterns from text
  // Patterns to match:
  // "3 x 2M fast" or "3x2M" or "6x800m"
  // "1.6km Easy" or "1.6 km easy"
  // "(400m rec)" or "400m recovery" or "with 400m jog"
  const segments: WorkoutSegment[] = [];

  // Split description into parts by semicolon or common separators
  const parts = description.split(/[;,]/).map((p: string) => p.trim()).filter((p: string) => p);

  let totalIntervals = 0;

  for (const part of parts) {
    const lowerPart = part.toLowerCase();

    // Check for interval pattern: "3 x 2M fast" or "3x800m"
    const intervalMatch = part.match(/(\d+)\s*x\s*([\d.]+)\s*(km|m|mi|M)\s*(fast|hard|tempo)?/i);
    if (intervalMatch) {
      const reps = parseInt(intervalMatch[1]);
      let distance = parseFloat(intervalMatch[2]);
      const unit = intervalMatch[3].toLowerCase();

      // Convert to km
      if (unit === 'm' || unit === 'M') {
        distance = distance / 1000;
      } else if (unit === 'mi') {
        distance = distance * 1.60934;
      }

      totalIntervals += reps;

      segments.push({
        type: 'interval',
        distanceKm: distance,
        repetitions: reps,
        targetPaceMin: targetPaceMin,
        targetPaceMax: targetPaceMin ? targetPaceMin + 0.25 : undefined // interval pace is tight range
      });

      // Check for recovery in the same part
      const recoveryMatch = part.match(/\(?([\d.]+)\s*(m|km)\s*(rec|recovery|jog)\)?/i);
      if (recoveryMatch) {
        let recDistance = parseFloat(recoveryMatch[1]);
        const recUnit = recoveryMatch[2].toLowerCase();
        if (recUnit === 'm') {
          recDistance = recDistance / 1000;
        }
        segments.push({
          type: 'recovery',
          distanceKm: recDistance,
          repetitions: reps - 1, // n-1 recoveries between n intervals
          targetPaceMin: targetPaceMax,
          targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
        });
      }
      continue;
    }

    // Check for distance + easy/warmup/cooldown pattern
    const distanceMatch = part.match(/([\d.]+)\s*(km|m|mi)\s*(easy|warmup|warm-up|cooldown|cool-down|recovery)?/i);
    if (distanceMatch) {
      let distance = parseFloat(distanceMatch[1]);
      const unit = distanceMatch[2].toLowerCase();
      const intensityWord = (distanceMatch[3] || 'easy').toLowerCase();

      if (unit === 'm') {
        distance = distance / 1000;
      } else if (unit === 'mi') {
        distance = distance * 1.60934;
      }

      let segmentType: WorkoutSegment['type'] = 'easy';
      if (intensityWord.includes('warm')) {
        segmentType = 'warmup';
      } else if (intensityWord.includes('cool')) {
        segmentType = 'cooldown';
      } else if (intensityWord.includes('recovery')) {
        segmentType = 'recovery';
      }

      segments.push({
        type: segmentType,
        distanceKm: distance,
        targetPaceMin: targetPaceMax,
        targetPaceMax: targetPaceMax ? targetPaceMax + 0.5 : undefined
      });
    }
  }

  // For interval target pace:
  // - min = target_pace_min (fast/interval pace)
  // - max = either target_pace_max OR target_pace_min + 0.5 as fallback
  // The range should allow some flexibility (usually 20-30 sec/km)
  let intervalMin: number | undefined;
  let intervalMax: number | undefined;

  if (targetPaceMin && !isNaN(targetPaceMin)) {
    intervalMin = targetPaceMin;
    // Use target_pace_max if it exists and makes sense (should be slower than min)
    // Otherwise use a reasonable range of +0.5 min/km (~30 sec)
    if (targetPaceMax && !isNaN(targetPaceMax) && targetPaceMax > targetPaceMin) {
      intervalMax = targetPaceMax;
    } else {
      intervalMax = targetPaceMin + 0.5; // 30 sec/km tolerance
    }
  }

  return {
    isStructured: segments.length > 0 && totalIntervals > 0,
    workoutType,
    segments,
    totalIntervals,
    intervalTargetPace: intervalMin ? { min: intervalMin, max: intervalMax! } : undefined,
    easyTargetPace: targetPaceMax && !isNaN(targetPaceMax) ? { min: targetPaceMax - 0.5, max: targetPaceMax + 0.5 } : undefined
  };
}

interface SplitSegmentMapping {
  segment: WorkoutSegment;
  splits: Array<{ km: number; paceMinKm: number; hr?: number }>;
  avgPace: number;
  paceVsTarget: 'on_target' | 'too_fast' | 'too_slow' | 'no_target';
}

/**
 * Map actual splits to planned workout segments
 * Uses distance-based matching to align splits with segments
 */
function mapSplitsToSegments(
  processedSplits: any,
  workoutStructure: ParsedWorkoutStructure
): SplitSegmentMapping[] {
  if (!processedSplits?.splits || !workoutStructure.isStructured) {
    return [];
  }

  const splits = processedSplits.splits.map((s: any) => ({
    km: s.km,
    paceMinKm: s.pace_seconds_per_km / 60,
    hr: s.avg_hr
  }));

  const mappings: SplitSegmentMapping[] = [];
  let currentKm = 0;

  for (const segment of workoutStructure.segments) {
    const segmentSplits: typeof splits = [];
    const segmentEndKm = currentKm + segment.distanceKm * (segment.repetitions || 1);

    // Handle recovery segments that are interleaved
    if (segment.type === 'recovery' && segment.repetitions) {
      // Recovery splits are between intervals - harder to map precisely
      // For now, we'll include them with the interval analysis
      continue;
    }

    // Find splits that fall within this segment
    for (const split of splits) {
      if (split.km > currentKm && split.km <= segmentEndKm + 0.5) {
        segmentSplits.push(split);
      }
    }

    const avgPace = segmentSplits.length > 0
      ? segmentSplits.reduce((sum, s) => sum + s.paceMinKm, 0) / segmentSplits.length
      : 0;

    let paceVsTarget: SplitSegmentMapping['paceVsTarget'] = 'no_target';
    if (segment.targetPaceMin && segment.targetPaceMax && avgPace > 0) {
      if (avgPace < segment.targetPaceMin - 0.1) {
        paceVsTarget = 'too_fast';
      } else if (avgPace > segment.targetPaceMax + 0.1) {
        paceVsTarget = 'too_slow';
      } else {
        paceVsTarget = 'on_target';
      }
    }

    mappings.push({
      segment,
      splits: segmentSplits,
      avgPace,
      paceVsTarget
    });

    currentKm = segmentEndKm;
  }

  return mappings;
}

/**
 * Generate workout-structure-aware evaluation
 */
function evaluateWorkoutExecution(
  processedSplits: any,
  plannedWorkout: any
): {
  isStructuredWorkout: boolean;
  structure: ParsedWorkoutStructure;
  evaluation: string;
  intervalExecution?: {
    totalIntervals: number;
    onTargetCount: number;
    tooFastCount: number;
    tooSlowCount: number;
    avgIntervalPace: number;
    targetPace: { min: number; max: number } | null;
  };
} {
  const structure = parseWorkoutStructure(plannedWorkout);

  if (!structure.isStructured || !processedSplits?.splits) {
    return {
      isStructuredWorkout: false,
      structure,
      evaluation: ''
    };
  }

  const mappings = mapSplitsToSegments(processedSplits, structure);

  // Analyze interval execution specifically
  const intervalMappings = mappings.filter(m => m.segment.type === 'interval');
  const easyMappings = mappings.filter(m =>
    m.segment.type === 'warmup' || m.segment.type === 'cooldown' || m.segment.type === 'easy'
  );

  let intervalExecution = undefined;
  if (intervalMappings.length > 0) {
    let onTargetCount = 0;
    let tooFastCount = 0;
    let tooSlowCount = 0;

    for (const mapping of intervalMappings) {
      if (mapping.paceVsTarget === 'on_target') onTargetCount++;
      else if (mapping.paceVsTarget === 'too_fast') tooFastCount++;
      else if (mapping.paceVsTarget === 'too_slow') tooSlowCount++;
    }

    const avgIntervalPace = intervalMappings.reduce((sum, m) => sum + m.avgPace, 0) / intervalMappings.length;

    intervalExecution = {
      totalIntervals: structure.totalIntervals,
      onTargetCount,
      tooFastCount,
      tooSlowCount,
      avgIntervalPace,
      targetPace: structure.intervalTargetPace || null
    };
  }

  // Build evaluation string
  const evaluationParts: string[] = [];

  // Interval evaluation
  if (intervalExecution && intervalExecution.targetPace) {
    const targetPaceStr = `${Math.floor(intervalExecution.targetPace.min)}:${String(Math.round((intervalExecution.targetPace.min % 1) * 60)).padStart(2, '0')}-${Math.floor(intervalExecution.targetPace.max)}:${String(Math.round((intervalExecution.targetPace.max % 1) * 60)).padStart(2, '0')}/km`;
    const actualPaceStr = `${Math.floor(intervalExecution.avgIntervalPace)}:${String(Math.round((intervalExecution.avgIntervalPace % 1) * 60)).padStart(2, '0')}/km`;

    if (intervalExecution.avgIntervalPace < intervalExecution.targetPace.min - 0.1) {
      evaluationParts.push(`Intervals ran FASTER than target (${actualPaceStr} vs ${targetPaceStr}) - great fitness but watch for overtraining.`);
    } else if (intervalExecution.avgIntervalPace > intervalExecution.targetPace.max + 0.1) {
      evaluationParts.push(`Intervals were SLOWER than target (${actualPaceStr} vs ${targetPaceStr}) - consider if fatigue or conditions affected performance.`);
    } else {
      evaluationParts.push(`Intervals executed ON TARGET (${actualPaceStr} within ${targetPaceStr}) - excellent pacing discipline!`);
    }
  }

  // Easy section evaluation
  if (easyMappings.length > 0 && structure.easyTargetPace) {
    const avgEasyPace = easyMappings.reduce((sum, m) => sum + m.avgPace, 0) / easyMappings.length;
    if (avgEasyPace < structure.easyTargetPace.min - 0.3) {
      evaluationParts.push('Warm-up/cool-down sections were faster than prescribed - remember easy sections should be truly easy to maximize interval quality.');
    }
  }

  return {
    isStructuredWorkout: true,
    structure,
    evaluation: evaluationParts.join(' '),
    intervalExecution
  };
}

/**
 * Analyze pacing from our computed processed_splits data
 * This uses the accurate per-km data computed from Strava streams
 */
function analyzeProcessedSplits(processedSplits: any): DailyRunInsight['pacing'] {
  const splits = processedSplits.splits;
  const analysis = processedSplits.analysis;

  if (!splits || splits.length < 2 || !analysis) {
    return {
      hasSplitsData: false,
      paceDelta: 0,
      consistency: 0,
      splitAnalysis: {
        fastestKm: { km: 1, pace: 0 },
        slowestKm: { km: 1, pace: 0 }
      }
    };
  }

  // Convert pace_seconds_per_km to min/km decimal
  const paces = splits.map((s: any) => ({
    km: s.km,
    pace: s.pace_seconds_per_km / 60 // Convert to minutes per km
  })).filter((p: any) => p.pace > 0);

  // Use pre-computed analysis values
  const paceDelta = analysis.negative_split
    ? Math.abs(analysis.pace_change_percent || 5) // Positive = got faster
    : analysis.positive_split
      ? -(Math.abs(analysis.pace_change_percent || 5)) // Negative = got slower
      : 0;

  return {
    hasSplitsData: true,
    paceDelta: Math.round(paceDelta * 10) / 10,
    consistency: analysis.pace_consistency || 0,
    splitAnalysis: {
      fastestKm: analysis.fastest_km
        ? { km: analysis.fastest_km.km, pace: analysis.fastest_km.pace_seconds / 60 }
        : paces[0],
      slowestKm: analysis.slowest_km
        ? { km: analysis.slowest_km.km, pace: analysis.slowest_km.pace_seconds / 60 }
        : paces[paces.length - 1],
      fadePoint: analysis.fade_point_km || undefined
    }
  };
}

/**
 * Analyze Pacing (fallback for Strava splits)
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
      hasSplitsData: false,
      paceDelta: 0,
      consistency: 0, // Changed from 1.0 - no data means no consistency score
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
      hasSplitsData: false,
      paceDelta: 0,
      consistency: 0,
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
    hasSplitsData: true,
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
      hasData: false,
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
      hasData: false,
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
    hasData: true,
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
        target_hr_zone: plannedWorkout.target_hr_zone,
        workout_type: plannedWorkout.workout_type
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
      hadPlannedWorkout: false,
      completedAsPlanned: false,
      distanceDeviation: 0,
      paceDeviation: 0,
      hrZoneDeviation: 0,
      modifications: [],
      paceOnTarget: false
    };
  }

  const targetDistance = plannedWorkout.target_distance_meters || plannedWorkout.distance_meters;
  const actualDistance = activityData.distance;

  const distanceDeviation = targetDistance
    ? ((actualDistance - targetDistance) / targetDistance * 100)
    : 0;

  // Calculate pace compliance using min/max range (not percentage deviation)
  const actualPace = speedToPace(activityData.average_speed); // min/km
  const targetPaceMin = plannedWorkout.target_pace_min; // min/km (faster)
  const targetPaceMax = plannedWorkout.target_pace_max; // min/km (slower)

  // Determine pace status: on_target, too_fast, too_slow
  let paceOnTarget = false;
  let paceStatus: 'on_target' | 'too_fast' | 'too_slow' | 'unknown' = 'unknown';

  if (targetPaceMin || targetPaceMax) {
    const effectiveMin = targetPaceMin || (targetPaceMax! - 0.5);
    const effectiveMax = targetPaceMax || (targetPaceMin! + 0.5);

    // Allow 3 seconds (0.05 min) tolerance
    if (actualPace >= effectiveMin - 0.05 && actualPace <= effectiveMax + 0.05) {
      paceOnTarget = true;
      paceStatus = 'on_target';
    } else if (actualPace < effectiveMin - 0.05) {
      paceStatus = 'too_fast';
    } else {
      paceStatus = 'too_slow';
    }
  }

  // Calculate pace deviation for display (percentage from target midpoint)
  const targetPaceMid = (targetPaceMin && targetPaceMax)
    ? (targetPaceMin + targetPaceMax) / 2
    : targetPaceMin || targetPaceMax;
  const paceDeviation = targetPaceMid
    ? ((actualPace - targetPaceMid) / targetPaceMid * 100)
    : 0;

  // Calculate HR zone deviation (negative = too easy, positive = too hard)
  const targetZone = plannedWorkout.target_hr_zone;
  const hrZoneDeviation = (targetZone && actualZone)
    ? Math.round(actualZone) - targetZone
    : 0;

  // Completed as planned requires:
  // - Distance within 10%
  // - Pace WITHIN target range (not just percentage)
  // - HR zone within 1 zone
  const distanceOnTarget = Math.abs(distanceDeviation) < 10;
  const hrOnTarget = Math.abs(hrZoneDeviation) <= 1;

  const completedAsPlanned = distanceOnTarget && paceOnTarget && hrOnTarget;

  const modifications: string[] = [];
  if (!distanceOnTarget) {
    modifications.push(distanceDeviation > 0 ? 'Extended distance' : 'Shortened distance');
  }
  if (paceStatus === 'too_slow') {
    modifications.push('Pace too slow');
  } else if (paceStatus === 'too_fast') {
    modifications.push('Pace too fast');
  }
  if (Math.abs(hrZoneDeviation) >= 2) {
    const zoneDirection = hrZoneDeviation < 0 ? 'easier' : 'harder';
    modifications.push(`HR ${Math.abs(hrZoneDeviation)} zones ${zoneDirection} than target`);
  }

  return {
    hadPlannedWorkout: true,
    completedAsPlanned,
    distanceDeviation: Math.round(distanceDeviation * 10) / 10,
    paceDeviation: Math.round(paceDeviation * 10) / 10,
    hrZoneDeviation,
    modifications,
    paceOnTarget
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
 * Baseline-Aware Coaching Messages
 * Used for plan-less users to compare against their rolling average
 */
const BASELINE_MESSAGES = {
  aboveBaseline: {
    strict: (percent: string) => `${percent}% above your typical run. Don't let occasional big runs replace consistent training.`,
    supportive: (percent: string) => `Nice push! This run was ${percent}% longer than your typical distance. Great effort!`,
    analytical: (percent: string) => `Run distance ${percent}% above 4-week baseline. This indicates progressive overload if within safe limits.`,
    motivational: (percent: string) => `You went ${percent}% further than your average - that's how you level up!`
  },
  belowBaseline: {
    strict: (percent: string) => `This run was ${percent}% below your typical distance. Maintain your baseline at minimum.`,
    supportive: (percent: string) => `A shorter run today at ${percent}% below your average - sometimes easy days are needed!`,
    analytical: (percent: string) => `Run distance ${percent}% below baseline. This is acceptable for recovery; monitor if pattern continues.`,
    motivational: (percent: string) => `An easier day at ${percent}% less than usual - your body might be thanking you for the recovery!`
  },
  atBaseline: {
    strict: 'Consistent with your baseline. This is the minimum standard.',
    supportive: 'Right on target with your typical training! Consistency is key.',
    analytical: 'Run within 10% of 4-week baseline. Training load consistent with established patterns.',
    motivational: 'Nailed your usual distance! Consistency like this builds lasting fitness!'
  },
  goodVolumeWeek: {
    strict: (percent: string) => `This week you're at ${percent}% of your baseline volume. Stay on track.`,
    supportive: (percent: string) => `You're at ${percent}% of your usual weekly volume - great progress!`,
    analytical: (percent: string) => `Weekly accumulation at ${percent}% of baseline. On track for maintenance.`,
    motivational: (percent: string) => `Already at ${percent}% of your weekly goal - you're crushing it!`
  },
  lowVolumeWeek: {
    strict: (percent: string) => `Only ${percent}% of your weekly baseline so far. You're behind.`,
    supportive: (percent: string) => `You're at ${percent}% of your usual week so far - still time to catch up!`,
    analytical: (percent: string) => `Weekly volume at ${percent}% of baseline. Consider additional sessions if available.`,
    motivational: (percent: string) => `${percent}% of your weekly volume down - plenty of opportunity to add more!`
  },
  volumeTrendUp: {
    strict: 'Volume trending up. Don\'t increase more than 10% weekly.',
    supportive: 'Your mileage is trending up - exciting progress! Just be mindful of recovery.',
    analytical: 'Positive volume trend detected. Recommend monitoring for overuse signals.',
    motivational: 'Your training is building! Keep this momentum going!'
  },
  volumeTrendDown: {
    strict: 'Volume trending down. Reverse this immediately unless injured.',
    supportive: 'Your volume has dipped a bit lately - let\'s work on rebuilding that consistency.',
    analytical: 'Negative volume trend observed. Assess barriers to training frequency.',
    motivational: 'Time to reignite that running spark! Your baseline is waiting for you.'
  },
  maintainerEncouragement: {
    strict: 'You showed up. That\'s the job done.',
    supportive: 'Another run in the books! You\'re doing exactly what you need for your health.',
    analytical: 'Cardiovascular maintenance stimulus delivered. Health benefits accruing.',
    motivational: 'Every run counts! You\'re investing in a healthier, happier you!'
  },
  builderProgress: {
    strict: 'Progress requires consistency. Keep adding to your baseline.',
    supportive: 'You\'re building something special! Each run adds to your foundation.',
    analytical: 'Progressive adaptation in process. Maintain gradual load increases.',
    motivational: 'Watch yourself grow stronger with every single run! You\'re building an incredible base!'
  }
};

/**
 * Generate baseline-aware compliance data for plan-less users
 */
function generateBaselineComparison(
  activityData: any,
  baseline: RollingBaseline | null
): DailyRunInsight['compliance'] {
  if (!baseline) {
    return {
      hadPlannedWorkout: false,
      completedAsPlanned: false,
      distanceDeviation: 0,
      paceDeviation: 0,
      hrZoneDeviation: 0,
      modifications: []
    };
  }

  const activityDistanceKm = (activityData.distance || 0) / 1000;
  const avgRunDistanceKm = baseline.avgDistanceKm / baseline.avgRunsPerWeek;

  // Calculate deviation from typical run distance
  const distanceDeviation = avgRunDistanceKm > 0
    ? ((activityDistanceKm - avgRunDistanceKm) / avgRunDistanceKm) * 100
    : 0;

  // Calculate pace deviation if we have baseline pace
  const actualPace = activityData.average_speed ? speedToPace(activityData.average_speed) : 0;
  const paceDeviation = baseline.avgPaceMinKm > 0 && actualPace > 0
    ? ((actualPace - baseline.avgPaceMinKm) / baseline.avgPaceMinKm) * 100
    : 0;

  // For baseline comparison, "completedAsPlanned" means within reasonable variance
  const completedAsPlanned = Math.abs(distanceDeviation) <= 20;

  const modifications: string[] = [];
  if (distanceDeviation > 20) {
    modifications.push(`${Math.round(distanceDeviation)}% longer than typical`);
  } else if (distanceDeviation < -20) {
    modifications.push(`${Math.round(Math.abs(distanceDeviation))}% shorter than typical`);
  }

  return {
    hadPlannedWorkout: false,
    completedAsPlanned,
    distanceDeviation: Math.round(distanceDeviation * 10) / 10,
    paceDeviation: Math.round(paceDeviation * 10) / 10,
    hrZoneDeviation: 0,
    modifications
  };
}

/**
 * Generate coaching points for plan-less users based on baseline comparison
 */
function generateBaselineCoachingPoints(
  pacing: DailyRunInsight['pacing'],
  hrBehavior: DailyRunInsight['hrBehavior'],
  effort: DailyRunInsight['effort'],
  baseline: RollingBaseline | null,
  activityDistanceKm: number,
  runnerType: RunnerType | null,
  coachStyle: CoachStyle = 'supportive'
): DailyRunInsight['coachingPoints'] {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let nextWorkoutAdjustment: string | undefined;

  const msg = BASELINE_MESSAGES;

  if (!baseline) {
    // No baseline yet - encourage consistency
    strengths.push('Building your training history! A few more weeks and we can track trends.');
    return { strengths, improvements, nextWorkoutAdjustment };
  }

  const avgRunDistanceKm = baseline.avgDistanceKm / Math.max(baseline.avgRunsPerWeek, 1);
  const distanceVsBaseline = avgRunDistanceKm > 0
    ? ((activityDistanceKm - avgRunDistanceKm) / avgRunDistanceKm) * 100
    : 0;

  // Distance comparison to baseline
  if (Math.abs(distanceVsBaseline) <= 10) {
    strengths.push(msg.atBaseline[coachStyle]);
  } else if (distanceVsBaseline > 10) {
    const percent = Math.round(distanceVsBaseline).toString();
    strengths.push(msg.aboveBaseline[coachStyle](percent));
    if (distanceVsBaseline > 30) {
      improvements.push('Large jumps in distance increase injury risk. Progress gradually.');
    }
  } else if (distanceVsBaseline < -10) {
    const percent = Math.round(Math.abs(distanceVsBaseline)).toString();
    strengths.push(msg.belowBaseline[coachStyle](percent));
  }

  // Weekly volume tracking
  if (baseline.percentOfBaseline >= 80) {
    const percent = baseline.percentOfBaseline.toString();
    strengths.push(msg.goodVolumeWeek[coachStyle](percent));
  } else if (baseline.percentOfBaseline < 50) {
    const percent = baseline.percentOfBaseline.toString();
    improvements.push(msg.lowVolumeWeek[coachStyle](percent));
  }

  // Volume trend feedback
  if (baseline.distanceTrend === 'increasing') {
    strengths.push(msg.volumeTrendUp[coachStyle]);
  } else if (baseline.distanceTrend === 'decreasing') {
    improvements.push(msg.volumeTrendDown[coachStyle]);
  }

  // Runner type specific encouragement
  if (runnerType === 'maintainer') {
    strengths.push(msg.maintainerEncouragement[coachStyle]);
  } else if (runnerType === 'builder') {
    strengths.push(msg.builderProgress[coachStyle]);
  }

  // Pacing feedback (same as plan-based)
  if (pacing.hasSplitsData) {
    if (pacing.paceDelta > 0) {
      const delta = Math.abs(pacing.paceDelta).toFixed(1);
      strengths.push(PERSONALITY_MESSAGES.negativeSplit[coachStyle](delta));
    }
    if (pacing.consistency > 0.9) {
      const score = (pacing.consistency * 100).toFixed(0);
      strengths.push(PERSONALITY_MESSAGES.paceConsistency[coachStyle](score));
    }
    if (pacing.paceDelta < -5) {
      const fadePercent = Math.abs(pacing.paceDelta).toFixed(1);
      improvements.push(PERSONALITY_MESSAGES.paceFade[coachStyle](fadePercent));
    }
  }

  // HR feedback (same as plan-based)
  if (hrBehavior.hasData) {
    if (hrBehavior.avgZone >= 1.8 && hrBehavior.avgZone <= 2.2 && effort.perceivedDifficulty === 'easy') {
      strengths.push(PERSONALITY_MESSAGES.perfectZone2[coachStyle]);
    }
    if (hrBehavior.driftRate < 2 && hrBehavior.driftRate >= 0) {
      strengths.push(PERSONALITY_MESSAGES.hrControl[coachStyle]);
    }
    if (hrBehavior.effortMismatch) {
      improvements.push(PERSONALITY_MESSAGES.effortMismatch[coachStyle]);
      nextWorkoutAdjustment = PERSONALITY_MESSAGES.hrAdjustment[coachStyle];
    }
  }

  return {
    strengths,
    improvements,
    nextWorkoutAdjustment
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
 * Workout Execution Evaluation Result Type
 */
interface WorkoutExecutionResult {
  isStructuredWorkout: boolean;
  structure: ParsedWorkoutStructure;
  evaluation: string;
  intervalExecution?: {
    totalIntervals: number;
    onTargetCount: number;
    tooFastCount: number;
    tooSlowCount: number;
    avgIntervalPace: number;
    targetPace: { min: number; max: number } | null;
  };
}

/**
 * Generate Coaching Points
 *
 * Creates specific, actionable feedback adjusted to coach personality:
 * - Strengths (what went well)
 * - Improvements (what to address)
 * - Next workout adjustment (specific guidance)
 * - Workout structure evaluation (for intervals, tempo, etc.)
 */
function generateCoachingPoints(
  pacing: DailyRunInsight['pacing'],
  hrBehavior: DailyRunInsight['hrBehavior'],
  effort: DailyRunInsight['effort'],
  compliance: DailyRunInsight['compliance'],
  _risks: DailyRunInsight['risks'],
  coachStyle: CoachStyle = 'supportive',
  workoutExecution?: WorkoutExecutionResult
): DailyRunInsight['coachingPoints'] {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let nextWorkoutAdjustment: string | undefined;

  const msg = PERSONALITY_MESSAGES;

  // ===========================================================================
  // STRUCTURED WORKOUT EVALUATION (intervals, tempo, etc.)
  // This takes priority over generic pacing analysis for structured workouts
  // ===========================================================================
  if (workoutExecution?.isStructuredWorkout && workoutExecution.intervalExecution) {
    const interval = workoutExecution.intervalExecution;

    // Format pace helper
    const formatPace = (paceMin: number): string => {
      const mins = Math.floor(paceMin);
      const secs = Math.round((paceMin % 1) * 60);
      return `${mins}:${String(secs).padStart(2, '0')}/km`;
    };

    if (interval.targetPace) {
      const targetRange = `${formatPace(interval.targetPace.min)}-${formatPace(interval.targetPace.max)}`;
      const actualPace = formatPace(interval.avgIntervalPace);

      // Evaluate interval execution
      if (interval.avgIntervalPace >= interval.targetPace.min - 0.1 &&
          interval.avgIntervalPace <= interval.targetPace.max + 0.1) {
        // ON TARGET
        const onTargetMsg = {
          strict: `Intervals executed at ${actualPace} (target: ${targetRange}). This is the standard expected.`,
          supportive: `Excellent interval execution! You hit ${actualPace} right in the target zone of ${targetRange}. Great pacing discipline!`,
          analytical: `Interval pace ${actualPace} within target range ${targetRange}. Training stimulus delivered as prescribed.`,
          motivational: `You nailed those intervals at ${actualPace}! That target of ${targetRange} didn't stand a chance!`
        };
        strengths.push(onTargetMsg[coachStyle]);
      } else if (interval.avgIntervalPace < interval.targetPace.min - 0.1) {
        // TOO FAST
        const tooFastMsg = {
          strict: `Intervals too fast at ${actualPace} (target: ${targetRange}). Save this energy for race day, not training.`,
          supportive: `Your intervals were faster than planned (${actualPace} vs ${targetRange}) - great fitness! Just be mindful of recovery.`,
          analytical: `Interval pace ${actualPace} exceeded target ${targetRange} by ${formatPace(interval.targetPace.min - interval.avgIntervalPace)}. Risk of accumulated fatigue.`,
          motivational: `You're running hot! ${actualPace} when target was ${targetRange} shows great fitness - channel that for race day!`
        };
        improvements.push(tooFastMsg[coachStyle]);
      } else {
        // TOO SLOW
        const tooSlowMsg = {
          strict: `Intervals too slow at ${actualPace} (target: ${targetRange}). Hit your targets or there's no point.`,
          supportive: `Your intervals came in at ${actualPace} (target: ${targetRange}) - conditions or fatigue may have played a role. Keep at it!`,
          analytical: `Interval pace ${actualPace} below target ${targetRange}. Consider factors: fatigue, weather, or pace perception.`,
          motivational: `Intervals at ${actualPace} were a bit off the ${targetRange} target - we'll nail it next time!`
        };
        improvements.push(tooSlowMsg[coachStyle]);
        nextWorkoutAdjustment = {
          strict: 'NEXT INTERVAL SESSION: Hit the prescribed paces. No excuses.',
          supportive: 'For your next interval workout, try shorter recovery if you\'re feeling strong, or adjust expectations if fatigued.',
          analytical: 'Recommendation: Review recent training load and sleep quality. Consider 5-10% intensity reduction if fatigued.',
          motivational: 'Next time, start the first rep conservatively and build into the session - you\'ve got this!'
        }[coachStyle];
      }
    } else {
      // No target pace but structured workout
      strengths.push(`Completed ${interval.totalIntervals} intervals successfully.`);
    }

    // Note: We don't add workoutExecution.evaluation separately since we already
    // generated proper coaching messages above. The evaluation string is used
    // internally for debugging/logging only.

    // Skip generic pacing analysis for structured workouts - it's not relevant
    // (consistency metrics don't apply to intentionally variable pace workouts)
  } else {
    // ===========================================================================
    // GENERIC PACING ANALYSIS (for non-structured workouts)
    // ===========================================================================

    // Pacing strengths - only if we have splits data
    if (pacing.hasSplitsData) {
      if (pacing.paceDelta > 0) {
        const delta = Math.abs(pacing.paceDelta).toFixed(1);
        strengths.push(msg.negativeSplit[coachStyle](delta));
      }
      if (pacing.consistency > 0.9) {
        const score = (pacing.consistency * 100).toFixed(0);
        strengths.push(msg.paceConsistency[coachStyle](score));
      }
    }

    // Pacing improvements - only if we have splits data
    if (pacing.hasSplitsData) {
      if (pacing.paceDelta < -5) {
        const fadePercent = Math.abs(pacing.paceDelta).toFixed(1);
        improvements.push(msg.paceFade[coachStyle](fadePercent));
        nextWorkoutAdjustment = msg.fadeAdjustment[coachStyle];
      }
      if (pacing.consistency < 0.75) {
        const score = (pacing.consistency * 100).toFixed(0);
        improvements.push(msg.inconsistentPacing[coachStyle](score));
      }
    }
  }

  // ===========================================================================
  // COMPLIANCE AND HR EVALUATION (applies to all workout types)
  // ===========================================================================

  // Compliance strengths - only if there was a planned workout
  if (compliance.hadPlannedWorkout && compliance.completedAsPlanned) {
    // Don't duplicate the "completed as planned" message if we already have structured workout feedback
    if (!workoutExecution?.isStructuredWorkout) {
      strengths.push(msg.completedAsPlanned[coachStyle]);
    }
  }

  // HR strengths - only if we have HR data
  if (hrBehavior.hasData) {
    // Don't praise Zone 2 execution for interval/tempo workouts - they're supposed to be hard!
    const hardWorkoutTypes = ['intervals', 'interval', 'tempo', 'speed', 'race'];
    const isHardWorkout = workoutExecution?.isStructuredWorkout &&
      hardWorkoutTypes.includes(workoutExecution.structure.workoutType.toLowerCase());
    if (hrBehavior.avgZone >= 1.8 && hrBehavior.avgZone <= 2.2 && effort.perceivedDifficulty === 'easy' && !isHardWorkout) {
      strengths.push(msg.perfectZone2[coachStyle]);
    }
    // HR control praise is fine for any workout type
    if (hrBehavior.driftRate < 2 && hrBehavior.driftRate >= 0) {
      strengths.push(msg.hrControl[coachStyle]);
    }
  }

  // HR improvements - only if we have HR data
  if (hrBehavior.hasData) {
    if (hrBehavior.effortMismatch) {
      improvements.push(msg.effortMismatch[coachStyle]);
      if (!nextWorkoutAdjustment) {
        nextWorkoutAdjustment = msg.hrAdjustment[coachStyle];
      }
    }
    if (hrBehavior.driftRate > 5) {
      const drift = hrBehavior.driftRate.toFixed(1);
      improvements.push(msg.hrDrift[coachStyle](drift));
    }
  }

  // Compliance improvements - only if there was a planned workout
  if (compliance.hadPlannedWorkout) {
    if (!compliance.completedAsPlanned && compliance.modifications.length > 0) {
      // For structured workouts, don't complain about pace deviation (it's intentional)
      if (!workoutExecution?.isStructuredWorkout) {
        const mods = compliance.modifications.join(', ');
        improvements.push(msg.modifiedWorkout[coachStyle](mods));
      }
    }

    // Check for HR zone deviation from target - only if we have HR data
    if (hrBehavior.hasData && compliance.hrZoneDeviation && Math.abs(compliance.hrZoneDeviation) >= 2) {
      const actualZone = Math.round(hrBehavior.avgZone).toString();
      const targetZone = (Math.round(hrBehavior.avgZone) - compliance.hrZoneDeviation).toString();
      improvements.push(msg.hrZoneMismatch[coachStyle](actualZone, targetZone));
    }
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
    // Prefer our processed_splits over Strava's splits_metric when available
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
      splits: activity.splits_metric || activity.splits_standard,
      // Use our processed splits if available (computed from Strava streams)
      processed_splits: activity.processed_splits
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
