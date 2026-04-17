/**
 * Execution Scoring Service
 *
 * Calculates execution accuracy scores for workouts based on:
 * - Pace compliance (40%): Was pace within target range?
 * - Distance compliance (30%): Was distance within ±5%?
 * - HR compliance (20%): Was HR in target zone?
 * - Consistency (10%): Even pacing throughout?
 *
 * Provides both individual workout scores and weekly summaries.
 */

import pool from '../config/database';

export interface ExecutionScore {
  overall: number;
  paceScore: number;
  distanceScore: number;
  hrScore: number;
  consistencyScore: number;
  status: 'excellent' | 'good' | 'fair' | 'needs_work';
  summary: string;
}

export interface WorkoutExecution {
  workoutId: number;
  workoutName: string;
  workoutType: string;
  scheduledDate: string;
  activityId: number | null;
  completionStatus: 'completed' | 'pending' | 'skipped';
  executionScore: number | null;
  executionStatus: 'excellent' | 'good' | 'fair' | 'needs_work' | null;
  issue: string | null;
}

export interface WeeklyExecutionSummary {
  weekStart: string;
  weekEnd: string;
  avgScore: number;
  workouts: WorkoutExecution[];
  completedCount: number;
  plannedCount: number;
  excellentCount: number;
  issueCount: number;
}

/**
 * Calculate execution score for a single workout/activity pair
 *
 * For interval/tempo workouts: Pace compliance is CRITICAL (50% weight)
 * For easy/recovery workouts: Distance and HR are more important
 */
export function calculateExecutionScore(
  activity: {
    distance: number;
    average_speed: number;
    average_heartrate?: number;
    splits?: any[];
  },
  plannedWorkout: {
    target_distance_meters?: number;
    target_pace_min?: number;
    target_pace_max?: number;
    target_hr_zone?: number;
    workout_type?: string;
  },
  hrZones: {
    zone1Max: number;
    zone2Max: number;
    zone3Max: number;
    zone4Max: number;
  },
  pacingConsistency: number = 1.0
): ExecutionScore {
  // Determine if this is a hard/quality workout where pace is critical
  const hardWorkoutTypes = ['intervals', 'interval', 'tempo', 'speed', 'race', 'threshold'];
  const isHardWorkout = plannedWorkout.workout_type
    ? hardWorkoutTypes.includes(plannedWorkout.workout_type.toLowerCase())
    : false;
  let paceScore = 100;
  let distanceScore = 100;
  let hrScore = 100;
  const consistencyScore = Math.round(pacingConsistency * 100);

  // Distance compliance (30% weight)
  if (plannedWorkout.target_distance_meters) {
    const targetDistance = plannedWorkout.target_distance_meters;
    const actualDistance = activity.distance;
    const distanceDeviation = Math.abs((actualDistance - targetDistance) / targetDistance) * 100;

    if (distanceDeviation <= 5) {
      distanceScore = 100;
    } else if (distanceDeviation <= 10) {
      distanceScore = 90 - (distanceDeviation - 5) * 2;
    } else if (distanceDeviation <= 20) {
      distanceScore = 80 - (distanceDeviation - 10) * 3;
    } else {
      distanceScore = Math.max(0, 50 - (distanceDeviation - 20) * 2);
    }
  }

  // Pace compliance (40% weight)
  // Handle cases where only one pace target exists
  const hasValidPaceTargets = (plannedWorkout.target_pace_min && !isNaN(plannedWorkout.target_pace_min)) ||
                               (plannedWorkout.target_pace_max && !isNaN(plannedWorkout.target_pace_max));

  if (hasValidPaceTargets && activity.average_speed > 0) {
    const actualPace = 1000 / (activity.average_speed * 60); // Convert m/s to min/km

    // Use available targets, defaulting to reasonable ranges if one is missing
    const targetMin = (plannedWorkout.target_pace_min && !isNaN(plannedWorkout.target_pace_min))
      ? plannedWorkout.target_pace_min
      : (plannedWorkout.target_pace_max! - 0.5); // If only max exists, assume min is 30s faster

    const targetMax = (plannedWorkout.target_pace_max && !isNaN(plannedWorkout.target_pace_max))
      ? plannedWorkout.target_pace_max
      : (plannedWorkout.target_pace_min! + 0.5); // If only min exists, assume max is 30s slower

    const targetRange = Math.max(targetMax - targetMin, 0.25); // Minimum 15 sec range

    if (actualPace >= targetMin && actualPace <= targetMax) {
      // Perfect - within target range
      paceScore = 100;
    } else if (actualPace < targetMin) {
      // Too fast - for easy runs this is bad, for intervals it's less bad
      const deviation = (targetMin - actualPace) / targetRange;
      paceScore = Math.max(0, 100 - deviation * 40);
    } else {
      // Too slow - more heavily penalized
      const deviation = (actualPace - targetMax) / targetRange;
      paceScore = Math.max(0, 100 - deviation * 60);
    }
  } else {
    // No pace targets available
    if (isHardWorkout) {
      // For hard workouts, missing pace targets is a critical data issue
      // We can't properly evaluate an interval/tempo workout without pace targets
      // Set score to -2 to indicate "missing critical data for this workout type"
      paceScore = -2; // Critical: hard workout missing pace targets
    } else {
      // For easy/recovery runs, missing pace targets is less critical
      paceScore = -1; // Marker for "no data"
    }
  }

  // HR compliance (20% weight)
  if (plannedWorkout.target_hr_zone && activity.average_heartrate) {
    const avgHR = activity.average_heartrate;
    const targetZone = plannedWorkout.target_hr_zone;

    // Determine what zone the actual HR falls into
    let actualZone: number;
    if (avgHR < hrZones.zone1Max) actualZone = 1;
    else if (avgHR < hrZones.zone2Max) actualZone = 2;
    else if (avgHR < hrZones.zone3Max) actualZone = 3;
    else if (avgHR < hrZones.zone4Max) actualZone = 4;
    else actualZone = 5;

    const zoneDiff = Math.abs(actualZone - targetZone);
    if (zoneDiff === 0) {
      hrScore = 100;
    } else if (zoneDiff === 1) {
      hrScore = 80;
    } else if (zoneDiff === 2) {
      hrScore = 50;
    } else {
      hrScore = 20;
    }
  }

  // Calculate overall score with weights
  // Different weights based on workout type and data availability
  let overall: number;
  let scoringNote = '';

  if (paceScore === -2) {
    // CRITICAL: Hard workout missing pace targets - cannot properly evaluate
    // Apply a significant penalty since we can't verify the most important aspect
    overall = Math.round(
      distanceScore * 0.35 +
      hrScore * 0.35 +
      consistencyScore * 0.10
    );
    // Cap at 70% max since we couldn't verify pace execution for a hard workout
    overall = Math.min(overall, 70);
    scoringNote = 'Missing pace targets for interval/tempo workout';
    paceScore = 0; // Reset for display
  } else if (paceScore === -1) {
    // Easy/recovery workout with no pace targets - less critical
    overall = Math.round(
      distanceScore * 0.5 +
      hrScore * 0.35 +
      consistencyScore * 0.15
    );
    paceScore = 0; // Reset for display purposes
  } else if (isHardWorkout) {
    // Hard workout with pace targets - pace is CRITICAL (50% weight)
    overall = Math.round(
      paceScore * 0.50 +       // Pace is most important for intervals/tempo
      distanceScore * 0.20 +
      hrScore * 0.20 +
      consistencyScore * 0.10
    );
  } else {
    // Easy/recovery workout with pace targets - standard weighting
    overall = Math.round(
      paceScore * 0.30 +       // Less important for easy runs
      distanceScore * 0.30 +
      hrScore * 0.30 +         // HR zone is important for easy runs
      consistencyScore * 0.10
    );
  }

  // Determine status
  let status: ExecutionScore['status'];
  if (overall >= 85) status = 'excellent';
  else if (overall >= 70) status = 'good';
  else if (overall >= 50) status = 'fair';
  else status = 'needs_work';

  // Generate summary
  let summary = '';

  // Add scoring note if applicable
  if (scoringNote) {
    summary = scoringNote + '. ';
  }

  if (status === 'excellent') {
    summary += 'Workout executed as planned';
  } else if (status === 'good') {
    const issues: string[] = [];
    if (paceScore < 80 && paceScore > 0) issues.push('pace slightly off target');
    if (distanceScore < 80) issues.push('distance deviation');
    if (hrScore < 80) issues.push('HR in adjacent zone');
    summary += issues.length > 0 ? `Minor issues: ${issues.join(', ')}` : 'Good execution overall';
  } else if (status === 'fair') {
    const issues: string[] = [];
    if (paceScore < 70) issues.push('pace significantly off');
    if (distanceScore < 70) issues.push('distance significantly off');
    if (hrScore < 70) issues.push('HR mismatch');
    if (consistencyScore < 70) issues.push('inconsistent pacing');
    summary += issues.length > 0 ? issues.join(', ') : 'Fair execution';
  } else {
    summary += 'Significant deviations from plan';
  }

  return {
    overall,
    paceScore: Math.round(paceScore),
    distanceScore: Math.round(distanceScore),
    hrScore: Math.round(hrScore),
    consistencyScore,
    status,
    summary,
  };
}

/**
 * Get weekly execution summary for a user
 */
export async function getWeeklyExecutionSummary(
  userId: number,
  weekStartsOn: 'sunday' | 'monday' = 'monday'
): Promise<WeeklyExecutionSummary> {
  // Calculate week boundaries
  const now = new Date();
  const day = now.getDay();
  const startOfWeek = new Date(now);

  if (weekStartsOn === 'monday') {
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
  } else {
    startOfWeek.setDate(startOfWeek.getDate() - day);
  }
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  // Get all planned workouts for this week with their completion status and insights
  const result = await pool.query(
    `SELECT
       pw.id as workout_id,
       pw.name as workout_name,
       pw.workout_type,
       pw.scheduled_date,
       pw.completion_status,
       pw.completed_activity_id as activity_id,
       dri.effort_analysis->>'executionScore' as execution_score,
       dri.compliance_check->>'modifications' as modifications
     FROM planned_workouts pw
     JOIN training_plans tp ON pw.training_plan_id = tp.id
     LEFT JOIN daily_run_insights dri ON dri.activity_id = pw.completed_activity_id
     WHERE tp.user_id = $1
       AND tp.is_active = true
       AND pw.scheduled_date >= $2
       AND pw.scheduled_date < $3
     ORDER BY pw.scheduled_date ASC`,
    [userId, startOfWeek, endOfWeek]
  );

  const workouts: WorkoutExecution[] = result.rows.map((row) => {
    let executionScore: number | null = null;
    let executionStatus: WorkoutExecution['executionStatus'] = null;
    let issue: string | null = null;

    if (row.completion_status === 'completed' && row.execution_score) {
      executionScore = parseInt(row.execution_score);
      if (executionScore >= 85) executionStatus = 'excellent';
      else if (executionScore >= 70) executionStatus = 'good';
      else if (executionScore >= 50) executionStatus = 'fair';
      else executionStatus = 'needs_work';

      // Parse modifications for issue summary
      if (row.modifications) {
        try {
          const mods = JSON.parse(row.modifications);
          if (Array.isArray(mods) && mods.length > 0) {
            issue = mods.join(', ');
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Generate issue description for non-excellent scores
      if (!issue && executionStatus !== 'excellent') {
        if (executionScore < 50) issue = 'Significant deviation from plan';
        else if (executionScore < 70) issue = 'Off target execution';
        else issue = 'Minor deviations';
      }
    }

    return {
      workoutId: row.workout_id,
      workoutName: row.workout_name || row.workout_type,
      workoutType: row.workout_type,
      scheduledDate: row.scheduled_date,
      activityId: row.activity_id,
      completionStatus: row.completion_status,
      executionScore,
      executionStatus,
      issue,
    };
  });

  // Calculate summary stats
  const completedWorkouts = workouts.filter(w => w.completionStatus === 'completed');
  const scores = completedWorkouts
    .map(w => w.executionScore)
    .filter((s): s is number => s !== null);

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    weekStart: startOfWeek.toISOString(),
    weekEnd: endOfWeek.toISOString(),
    avgScore,
    workouts,
    completedCount: completedWorkouts.length,
    plannedCount: workouts.length,
    excellentCount: workouts.filter(w => w.executionStatus === 'excellent').length,
    issueCount: workouts.filter(w => w.issue !== null).length,
  };
}

/**
 * Get execution indicator for calendar display
 * Returns color code and status for each completed workout
 */
export async function getCalendarExecutionIndicators(
  userId: number,
  startDate: Date,
  endDate: Date
): Promise<Map<number, { status: string; score: number | null }>> {
  const result = await pool.query(
    `SELECT
       pw.id as workout_id,
       pw.completion_status,
       dri.effort_analysis->>'executionScore' as execution_score
     FROM planned_workouts pw
     JOIN training_plans tp ON pw.training_plan_id = tp.id
     LEFT JOIN daily_run_insights dri ON dri.activity_id = pw.completed_activity_id
     WHERE tp.user_id = $1
       AND tp.is_active = true
       AND pw.scheduled_date >= $2
       AND pw.scheduled_date <= $3`,
    [userId, startDate, endDate]
  );

  const indicators = new Map<number, { status: string; score: number | null }>();

  for (const row of result.rows) {
    let status = 'pending';
    let score: number | null = null;

    if (row.completion_status === 'completed') {
      if (row.execution_score) {
        score = parseInt(row.execution_score);
        if (score >= 85) status = 'excellent';
        else if (score >= 70) status = 'good';
        else if (score >= 50) status = 'fair';
        else status = 'poor';
      } else {
        status = 'completed';
      }
    } else if (row.completion_status === 'skipped') {
      status = 'skipped';
    }

    indicators.set(row.workout_id, { status, score });
  }

  return indicators;
}
