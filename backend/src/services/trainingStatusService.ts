/**
 * Training Status Service
 *
 * Computes the overall training status for the dashboard.
 * Answers the key question: "Am I on track?"
 *
 * Status indicators:
 * - ON_TRACK (green): Training going well
 * - CAUTION (yellow): Minor concerns to address
 * - AT_RISK (red): Significant issues requiring attention
 */

import pool from '../config/database';
import { getActiveGoal } from '../models/Goal';
import { getActivePlan } from '../models/TrainingPlan';
import { getPlannedWorkoutsByDateRange } from '../models/PlannedWorkout';
import { getActivitiesAfterDate } from '../models/Activity';
import { getProfileByUserId } from '../models/UserProfile';

export type TrainingStatus = 'on_track' | 'caution' | 'at_risk';

export interface TrainingStatusData {
  status: TrainingStatus;
  weekNumber: number | null;
  totalWeeks: number | null;
  trainingPhase: 'base' | 'build' | 'peak' | 'taper' | null;
  weeksUntilRace: number | null;
  volumeProgress: {
    completed: number;
    planned: number;
    percentage: number;
  };
  executionScore: number | null;
  keyInsight: string;
  statusReasons: string[];
}

/**
 * Calculate training status for a user
 */
export async function getTrainingStatus(userId: number): Promise<TrainingStatusData> {
  // Fetch all required data
  const [activeGoal, activePlan, profile] = await Promise.all([
    getActiveGoal(userId),
    getActivePlan(userId),
    getProfileByUserId(userId),
  ]);

  // Calculate week boundaries based on user preference
  const weekStartsOn = profile?.week_starts_on || 'sunday';
  const { startOfWeek, endOfWeek } = getWeekBoundaries(weekStartsOn);

  // Get this week's workouts and activities
  const thisWeekWorkouts = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek)
    : [];

  const thisWeekActivities = await getActivitiesAfterDate(userId, startOfWeek);
  const filteredActivities = thisWeekActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < endOfWeek;
  });

  // Calculate volume progress
  const plannedDistance = thisWeekWorkouts.reduce((sum, w) =>
    sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
  );

  const completedDistance = filteredActivities.reduce((sum, a) =>
    sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
  );

  const volumePercentage = plannedDistance > 0
    ? Math.round((completedDistance / plannedDistance) * 100)
    : 0;

  // Calculate execution score (average from completed workouts)
  const executionScore = await calculateWeeklyExecutionScore(userId, startOfWeek, endOfWeek);

  // Determine training context
  let weekNumber: number | null = null;
  let totalWeeks: number | null = null;
  let trainingPhase: TrainingStatusData['trainingPhase'] = null;
  let weeksUntilRace: number | null = null;

  if (activePlan) {
    const planStart = new Date(activePlan.start_date);
    const now = new Date();
    const weeksDiff = Math.floor((now.getTime() - planStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weekNumber = Math.max(1, weeksDiff + 1);
    totalWeeks = activePlan.total_weeks || null;
  }

  if (activeGoal?.target_date) {
    const daysUntil = Math.ceil(
      (new Date(activeGoal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    weeksUntilRace = Math.ceil(daysUntil / 7);

    // Determine training phase based on weeks until race
    if (weeksUntilRace <= 2) trainingPhase = 'taper';
    else if (weeksUntilRace <= 4) trainingPhase = 'peak';
    else if (weeksUntilRace <= 8) trainingPhase = 'build';
    else trainingPhase = 'base';
  }

  // Determine status and reasons
  const { status, reasons, keyInsight } = determineStatus({
    volumePercentage,
    executionScore,
    weekNumber,
    totalWeeks,
    weeksUntilRace,
    trainingPhase,
    completedWorkouts: filteredActivities.length,
    plannedWorkouts: thisWeekWorkouts.length,
  });

  return {
    status,
    weekNumber,
    totalWeeks,
    trainingPhase,
    weeksUntilRace,
    volumeProgress: {
      completed: Math.round(completedDistance * 10) / 10,
      planned: Math.round(plannedDistance * 10) / 10,
      percentage: volumePercentage,
    },
    executionScore,
    keyInsight,
    statusReasons: reasons,
  };
}

/**
 * Get week boundaries based on user preference
 */
function getWeekBoundaries(weekStartsOn: 'sunday' | 'monday'): {
  startOfWeek: Date;
  endOfWeek: Date;
} {
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

  return { startOfWeek, endOfWeek };
}

/**
 * Calculate average execution score for the week
 */
async function calculateWeeklyExecutionScore(
  userId: number,
  startOfWeek: Date,
  endOfWeek: Date
): Promise<number | null> {
  try {
    const result = await pool.query(
      `SELECT AVG((effort_analysis->>'executionScore')::numeric) as avg_score
       FROM daily_run_insights
       WHERE user_id = $1
         AND run_date >= $2
         AND run_date < $3
         AND effort_analysis->>'executionScore' IS NOT NULL`,
      [userId, startOfWeek, endOfWeek]
    );

    if (result.rows[0]?.avg_score) {
      return Math.round(parseFloat(result.rows[0].avg_score));
    }
    return null;
  } catch (error) {
    console.warn('Failed to calculate execution score:', error);
    return null;
  }
}

/**
 * Determine overall status based on various metrics
 */
function determineStatus(params: {
  volumePercentage: number;
  executionScore: number | null;
  weekNumber: number | null;
  totalWeeks: number | null;
  weeksUntilRace: number | null;
  trainingPhase: TrainingStatusData['trainingPhase'];
  completedWorkouts: number;
  plannedWorkouts: number;
}): { status: TrainingStatus; reasons: string[]; keyInsight: string } {
  const reasons: string[] = [];
  let status: TrainingStatus = 'on_track';

  const {
    volumePercentage,
    executionScore,
    weeksUntilRace,
    trainingPhase,
    completedWorkouts,
    plannedWorkouts,
  } = params;

  // Get day of week (0 = Sunday)
  const dayOfWeek = new Date().getDay();
  const weekProgress = ((dayOfWeek === 0 ? 7 : dayOfWeek) / 7) * 100;

  // Evaluate volume progress relative to week progress
  const volumeOnTrack = volumePercentage >= weekProgress * 0.8;
  const volumeBehind = volumePercentage < weekProgress * 0.6;

  if (volumeBehind) {
    status = 'caution';
    reasons.push(`Volume ${volumePercentage}% vs ${Math.round(weekProgress)}% through week`);
  } else if (volumeOnTrack) {
    reasons.push('Volume on track');
  }

  // Evaluate execution quality
  if (executionScore !== null) {
    if (executionScore >= 85) {
      reasons.push('Excellent execution');
    } else if (executionScore >= 70) {
      reasons.push('Good execution');
    } else if (executionScore < 60) {
      if (status === 'on_track') status = 'caution';
      reasons.push(`Execution needs work (${executionScore}%)`);
    }
  }

  // Check workout completion
  if (plannedWorkouts > 0) {
    const completionRate = (completedWorkouts / plannedWorkouts) * 100;
    if (completionRate < 50 && weekProgress > 50) {
      status = 'caution';
      reasons.push('Missing workouts');
    }
  }

  // Race proximity checks
  if (weeksUntilRace !== null && weeksUntilRace <= 4) {
    if (volumeBehind || (executionScore !== null && executionScore < 70)) {
      status = 'at_risk';
      reasons.push('Race approaching - address issues');
    }
  }

  // Generate key insight based on status
  let keyInsight = '';

  if (status === 'on_track') {
    if (trainingPhase === 'taper') {
      keyInsight = 'Taper going well - stay patient and trust the process';
    } else if (trainingPhase === 'peak') {
      keyInsight = 'Peak training on track - maintain intensity';
    } else if (executionScore && executionScore >= 90) {
      keyInsight = 'Excellent execution - quality work pays off';
    } else {
      keyInsight = 'Training on track - keep up the consistency';
    }
  } else if (status === 'caution') {
    if (volumeBehind) {
      keyInsight = 'Falling behind on volume - prioritize key sessions';
    } else if (executionScore !== null && executionScore < 70) {
      keyInsight = 'Execution below target - focus on workout quality';
    } else {
      keyInsight = 'Minor adjustments needed - stay focused';
    }
  } else {
    if (weeksUntilRace && weeksUntilRace <= 4) {
      keyInsight = 'Race soon - critical to get back on track now';
    } else {
      keyInsight = 'Training needs attention - time to regroup';
    }
  }

  return { status, reasons, keyInsight };
}
