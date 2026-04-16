/**
 * Tiered Context Builders
 *
 * Builds context in three tiers for JIT (Just-In-Time) loading:
 * - CORE (~1k tokens): Basic profile and goal info - always loaded
 * - ACTIVE (~3k tokens): Current week data - loaded for most queries
 * - DEEP (~15k tokens): Historical data and RAG - only for progress/trend analysis
 *
 * This enables the multi-agent architecture to load only what's needed
 * rather than everything upfront.
 */

import { getUserById } from '../models/User';
import { getProfileByUserId } from '../models/UserProfile';
import { getActiveGoal } from '../models/Goal';
import { getActivitiesAfterDate, getActivityStats } from '../models/Activity';
import { getActivePlan } from '../models/TrainingPlan';
import { getUpcomingWorkouts, getPlannedWorkoutsByDateRange } from '../models/PlannedWorkout';
import { getHRZoneSummary } from '../models/ActivityHRZone';
import { getDailyInsights, getLatestWeeklyInsight, filterProfileForCoaching } from './contextBuilder';

// ============================================
// Type Definitions
// ============================================

export interface CoreContext {
  firstName: string;
  lastName: string;
  goalType: string | null;
  goalDate: string | null;
  goalPace: string | null;
  goalTimeFormatted: string | null;
  trainingPhase: string | null;
  weeksRemaining: number | null;
  coachStyle: string;
  experienceYears: number | null;
  preferredUnits: 'metric' | 'imperial';
  age: number | null;
  weekStartsOn: 'sunday' | 'monday';
}

export interface ActivitySummary {
  id: number;
  startDate: string;
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  averagePace: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  hrZoneDistribution?: {
    zone1Percent: number;
    zone2Percent: number;
    zone3Percent: number;
    zone4Percent: number;
    zone5Percent: number;
  };
}

export interface WorkoutSummary {
  id: number;
  scheduledDate: string;
  workoutType: string;
  name: string | null;
  targetDistanceMeters: number | null;
  targetPaceAvg: number | null;
  targetHrZone: number | null;
  completionStatus: 'pending' | 'completed' | 'skipped';
  completedActivityId: number | null;
  description: string | null;
}

export interface ActiveContext {
  thisWeekWorkouts: WorkoutSummary[];
  lastTwoRuns: ActivitySummary[];
  currentAdherence: {
    planned: number;
    completed: number;
    adherenceRate: number;
    plannedDistanceKm: number;
    actualDistanceKm: number;
  };
  hrZones: {
    zone1Max: number;
    zone2Max: number;
    zone3Max: number;
    zone4Max: number;
    zone5Max: number;
  } | null;
  upcomingWorkoutCount: number;
  thisWeekStats: {
    totalDistanceKm: number;
    totalDurationMinutes: number;
    runCount: number;
    avgPace: number | null;
    avgHR: number | null;
  };
}

export interface WeeklyInsight {
  weekStart: string;
  totalDistanceKm: number;
  avgPace: number | null;
  adherenceRate: number;
  keyInsights: string[];
}

export interface RAGResult {
  type: string;
  content: string;
  relevance: number;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface DeepContext {
  thirtyDayActivities: ActivitySummary[];
  fourWeekPlan: WorkoutSummary[];
  weeklyInsights: WeeklyInsight[];
  runnerTendencies: any[];
  hrZoneDistribution: {
    zone1Hours: number;
    zone2Hours: number;
    zone3Hours: number;
    zone4Hours: number;
    zone5Hours: number;
    totalHours: number;
  };
  longRunProgression: number[];
  planAdherenceLast4Weeks: number;
}

// ============================================
// CORE CONTEXT BUILDER (~1k tokens)
// ============================================

export async function buildCoreContext(userId: number): Promise<CoreContext> {
  console.log('📦 Building CORE context (~1k tokens)');

  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  // Calculate weeks remaining and training phase
  let weeksRemaining: number | null = null;
  let trainingPhase: string | null = null;

  if (activeGoal?.target_date) {
    const goalDate = new Date(activeGoal.target_date);
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    weeksRemaining = Math.ceil((goalDate.getTime() - now.getTime()) / msPerWeek);

    // Determine training phase based on weeks remaining
    if (weeksRemaining <= 2) {
      trainingPhase = 'taper';
    } else if (weeksRemaining <= 4) {
      trainingPhase = 'peak';
    } else if (weeksRemaining <= 10) {
      trainingPhase = 'build';
    } else {
      trainingPhase = 'base';
    }
  }

  // Format goal pace if available
  let goalPace: string | null = null;
  let goalTimeFormatted: string | null = null;

  if (activeGoal?.target_time_seconds && activeGoal.goal_type) {
    const distanceKm = getDistanceForGoalType(activeGoal.goal_type);
    if (distanceKm) {
      const paceMinPerKm = (activeGoal.target_time_seconds / 60) / distanceKm;
      const minutes = Math.floor(paceMinPerKm);
      const seconds = Math.round((paceMinPerKm - minutes) * 60);
      goalPace = `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
    }

    // Format goal time
    const hours = Math.floor(activeGoal.target_time_seconds / 3600);
    const mins = Math.floor((activeGoal.target_time_seconds % 3600) / 60);
    const secs = activeGoal.target_time_seconds % 60;
    goalTimeFormatted = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Get age from profile (already stored)
  const age = profile?.age || null;

  return {
    firstName: user.first_name,
    lastName: user.last_name || '',
    goalType: activeGoal?.goal_type || null,
    goalDate: activeGoal?.target_date ? new Date(activeGoal.target_date).toISOString().split('T')[0] : null,
    goalPace,
    goalTimeFormatted,
    trainingPhase,
    weeksRemaining,
    coachStyle: profile?.coach_style || 'balanced',
    experienceYears: profile?.running_experience_years || null,
    preferredUnits: profile?.preferred_units || 'metric',
    age,
    weekStartsOn: profile?.week_starts_on || 'sunday',
  };
}

// ============================================
// ACTIVE CONTEXT BUILDER (~3k tokens)
// ============================================

export async function buildActiveContext(userId: number): Promise<ActiveContext> {
  console.log('📦 Building ACTIVE context (~3k tokens)');

  const profile = await getProfileByUserId(userId);
  const weekStartsOn = (profile?.week_starts_on || 'sunday') as 'sunday' | 'monday';

  // Calculate week boundaries
  const startOfWeek = getStartOfWeek(weekStartsOn);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  // Get this week's activities
  const thisWeekActivities = await getActivitiesAfterDate(userId, startOfWeek);
  const filteredActivities = thisWeekActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < endOfWeek;
  });

  // Get last 2 runs (most recent first)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActivities = await getActivitiesAfterDate(userId, sevenDaysAgo);
  const lastTwoRuns: ActivitySummary[] = recentActivities
    .slice(0, 2)
    .map(a => ({
      id: a.id,
      startDate: new Date(a.start_date).toISOString(),
      name: a.name,
      distanceMeters: a.distance_meters,
      movingTimeSeconds: a.moving_time_seconds,
      averagePace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : null,
      averageHeartrate: a.average_heartrate ? parseFloat(String(a.average_heartrate)) : null,
      maxHeartrate: a.max_heartrate ? parseFloat(String(a.max_heartrate)) : null,
    }));

  // Get this week's planned workouts
  const thisWeekWorkouts = await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek);

  // Get upcoming workout count (next 7 days from today)
  const upcomingWorkouts = await getUpcomingWorkouts(userId, 7);
  const upcomingWorkoutCount = upcomingWorkouts.length;

  // Calculate adherence (workouts that should be done by now)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pastWorkouts = thisWeekWorkouts.filter(w => new Date(w.scheduled_date) < todayStart);
  const completedCount = filteredActivities.length;

  const plannedDistanceKm = pastWorkouts.reduce((sum, w) =>
    sum + (w.target_distance_meters ? w.target_distance_meters / 1000 : 0), 0
  );
  const actualDistanceKm = filteredActivities.reduce((sum, a) =>
    sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
  );

  // Calculate this week's stats
  const totalDistanceKm = filteredActivities.reduce((sum, a) =>
    sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
  );
  const totalDurationMinutes = filteredActivities.reduce((sum, a) =>
    sum + (a.moving_time_seconds ? a.moving_time_seconds / 60 : 0), 0
  );

  const activitiesWithSpeed = filteredActivities.filter(a => a.average_speed);
  const avgPace = activitiesWithSpeed.length > 0
    ? activitiesWithSpeed.reduce((sum, a) =>
        sum + (1000 / (parseFloat(String(a.average_speed)) * 60)), 0) / activitiesWithSpeed.length
    : null;

  const activitiesWithHR = filteredActivities.filter(a => a.average_heartrate);
  const avgHR = activitiesWithHR.length > 0
    ? Math.round(activitiesWithHR.reduce((sum, a) =>
        sum + parseFloat(String(a.average_heartrate)), 0) / activitiesWithHR.length)
    : null;

  // Map workouts to summary format
  const workoutSummaries: WorkoutSummary[] = thisWeekWorkouts.map(w => ({
    id: w.id,
    scheduledDate: new Date(w.scheduled_date).toISOString().split('T')[0],
    workoutType: w.workout_type,
    name: w.name,
    targetDistanceMeters: w.target_distance_meters,
    targetPaceAvg: w.target_pace_avg,
    targetHrZone: w.target_hr_zone,
    completionStatus: w.completion_status as 'pending' | 'completed' | 'skipped',
    completedActivityId: w.completed_activity_id,
    description: w.description,
  }));

  return {
    thisWeekWorkouts: workoutSummaries,
    lastTwoRuns,
    currentAdherence: {
      planned: pastWorkouts.length,
      completed: completedCount,
      adherenceRate: pastWorkouts.length > 0
        ? Math.round((completedCount / pastWorkouts.length) * 100)
        : 100,
      plannedDistanceKm,
      actualDistanceKm,
    },
    hrZones: profile ? {
      zone1Max: profile.hr_zone_1_max || 120,
      zone2Max: profile.hr_zone_2_max || 140,
      zone3Max: profile.hr_zone_3_max || 160,
      zone4Max: profile.hr_zone_4_max || 175,
      zone5Max: profile.hr_zone_5_max || 220,
    } : null,
    upcomingWorkoutCount,
    thisWeekStats: {
      totalDistanceKm,
      totalDurationMinutes,
      runCount: filteredActivities.length,
      avgPace,
      avgHR,
    },
  };
}

// ============================================
// DEEP CONTEXT BUILDER (~15k tokens)
// ============================================

export async function buildDeepContext(userId: number): Promise<DeepContext> {
  console.log('📦 Building DEEP context (~15k tokens)');

  // Get 30 days of activities
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const allActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);

  // Map to summary format
  const thirtyDayActivities: ActivitySummary[] = allActivities.map(a => ({
    id: a.id,
    startDate: new Date(a.start_date).toISOString(),
    name: a.name,
    distanceMeters: a.distance_meters,
    movingTimeSeconds: a.moving_time_seconds,
    averagePace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : null,
    averageHeartrate: a.average_heartrate ? parseFloat(String(a.average_heartrate)) : null,
    maxHeartrate: a.max_heartrate ? parseFloat(String(a.max_heartrate)) : null,
  }));

  // Get 4 weeks of planned workouts
  const now = new Date();
  const fourWeeksOut = new Date();
  fourWeeksOut.setDate(fourWeeksOut.getDate() + 28);
  const upcomingWorkouts = await getUpcomingWorkouts(userId, 28);

  const fourWeekPlan: WorkoutSummary[] = upcomingWorkouts.map(w => ({
    id: w.id,
    scheduledDate: new Date(w.scheduled_date).toISOString().split('T')[0],
    workoutType: w.workout_type,
    name: w.name,
    targetDistanceMeters: w.target_distance_meters,
    targetPaceAvg: w.target_pace_avg,
    targetHrZone: w.target_hr_zone,
    completionStatus: w.completion_status as 'pending' | 'completed' | 'skipped',
    completedActivityId: w.completed_activity_id,
    description: w.description,
  }));

  // Get HR zone distribution
  const hrZoneData = await getHRZoneSummary(userId, 30);
  const hrZoneDistribution = {
    zone1Hours: Number(hrZoneData.total_zone_1) / 3600,
    zone2Hours: Number(hrZoneData.total_zone_2) / 3600,
    zone3Hours: Number(hrZoneData.total_zone_3) / 3600,
    zone4Hours: Number(hrZoneData.total_zone_4) / 3600,
    zone5Hours: Number(hrZoneData.total_zone_5) / 3600,
    totalHours: (
      Number(hrZoneData.total_zone_1) +
      Number(hrZoneData.total_zone_2) +
      Number(hrZoneData.total_zone_3) +
      Number(hrZoneData.total_zone_4) +
      Number(hrZoneData.total_zone_5)
    ) / 3600,
  };

  // Build weekly insights from activities
  const profile = await getProfileByUserId(userId);
  const weekStartsOn = (profile?.week_starts_on || 'sunday') as 'sunday' | 'monday';
  const weeklyInsights = buildWeeklyInsightsFromActivities(allActivities, weekStartsOn);

  // Runner tendencies placeholder (not yet implemented)
  const runnerTendencies: any[] = [];

  // Build long run progression (last 4 weeks)
  const longRunProgression = buildLongRunProgression(allActivities);

  // Calculate 4-week adherence
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const plannedLast4Weeks = await getPlannedWorkoutsByDateRange(userId, fourWeeksAgo, now);
  const completedCount = plannedLast4Weeks.filter(w =>
    w.completion_status === 'completed'
  ).length;
  const planAdherenceLast4Weeks = plannedLast4Weeks.length > 0
    ? Math.round((completedCount / plannedLast4Weeks.length) * 100)
    : 100;

  return {
    thirtyDayActivities,
    fourWeekPlan,
    weeklyInsights,
    runnerTendencies,
    hrZoneDistribution,
    longRunProgression,
    planAdherenceLast4Weeks,
  };
}

// ============================================
// JIT Data Fetching Functions (for tools)
// ============================================

/**
 * Get a specific activity by ID
 */
export async function getActivityById(userId: number, activityId: number): Promise<ActivitySummary | null> {
  const { query } = await import('../config/database');
  const result = await query(
    `SELECT * FROM activities WHERE id = $1 AND user_id = $2`,
    [activityId, userId]
  );

  if (result.rows.length === 0) return null;

  const a = result.rows[0];
  return {
    id: a.id,
    startDate: new Date(a.start_date).toISOString(),
    name: a.name,
    distanceMeters: a.distance_meters,
    movingTimeSeconds: a.moving_time_seconds,
    averagePace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : null,
    averageHeartrate: a.average_heartrate ? parseFloat(String(a.average_heartrate)) : null,
    maxHeartrate: a.max_heartrate ? parseFloat(String(a.max_heartrate)) : null,
  };
}

/**
 * Get the most recent activity
 */
export async function getLastActivity(userId: number): Promise<ActivitySummary | null> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 14);
  const activities = await getActivitiesAfterDate(userId, oneDayAgo);

  if (activities.length === 0) return null;

  const a = activities[0];
  return {
    id: a.id,
    startDate: new Date(a.start_date).toISOString(),
    name: a.name,
    distanceMeters: a.distance_meters,
    movingTimeSeconds: a.moving_time_seconds,
    averagePace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : null,
    averageHeartrate: a.average_heartrate ? parseFloat(String(a.average_heartrate)) : null,
    maxHeartrate: a.max_heartrate ? parseFloat(String(a.max_heartrate)) : null,
  };
}

/**
 * Get recent activities
 */
export async function getRecentActivities(userId: number, days: number): Promise<ActivitySummary[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const activities = await getActivitiesAfterDate(userId, startDate);

  return activities.map(a => ({
    id: a.id,
    startDate: new Date(a.start_date).toISOString(),
    name: a.name,
    distanceMeters: a.distance_meters,
    movingTimeSeconds: a.moving_time_seconds,
    averagePace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : null,
    averageHeartrate: a.average_heartrate ? parseFloat(String(a.average_heartrate)) : null,
    maxHeartrate: a.max_heartrate ? parseFloat(String(a.max_heartrate)) : null,
  }));
}

/**
 * Get upcoming workouts
 */
export async function getUpcomingWorkoutsForDays(userId: number, days: number): Promise<WorkoutSummary[]> {
  const workouts = await getUpcomingWorkouts(userId, days);

  return workouts.map(w => ({
    id: w.id,
    scheduledDate: new Date(w.scheduled_date).toISOString().split('T')[0],
    workoutType: w.workout_type,
    name: w.name,
    targetDistanceMeters: w.target_distance_meters,
    targetPaceAvg: w.target_pace_avg,
    targetHrZone: w.target_hr_zone,
    completionStatus: w.completion_status as 'pending' | 'completed' | 'skipped',
    completedActivityId: w.completed_activity_id,
    description: w.description,
  }));
}

/**
 * Get HR zone summary
 */
export async function getHRZoneSummaryForDays(userId: number, days: number) {
  const hrZoneData = await getHRZoneSummary(userId, days);
  const totalSeconds = Number(hrZoneData.total_zone_1) +
    Number(hrZoneData.total_zone_2) +
    Number(hrZoneData.total_zone_3) +
    Number(hrZoneData.total_zone_4) +
    Number(hrZoneData.total_zone_5);

  return {
    zone1Percent: totalSeconds > 0 ? Math.round((Number(hrZoneData.total_zone_1) / totalSeconds) * 100) : 0,
    zone2Percent: totalSeconds > 0 ? Math.round((Number(hrZoneData.total_zone_2) / totalSeconds) * 100) : 0,
    zone3Percent: totalSeconds > 0 ? Math.round((Number(hrZoneData.total_zone_3) / totalSeconds) * 100) : 0,
    zone4Percent: totalSeconds > 0 ? Math.round((Number(hrZoneData.total_zone_4) / totalSeconds) * 100) : 0,
    zone5Percent: totalSeconds > 0 ? Math.round((Number(hrZoneData.total_zone_5) / totalSeconds) * 100) : 0,
    totalHours: totalSeconds / 3600,
    aerobicPercent: totalSeconds > 0
      ? Math.round(((Number(hrZoneData.total_zone_1) + Number(hrZoneData.total_zone_2)) / totalSeconds) * 100)
      : 0,
  };
}

// ============================================
// Helper Functions
// ============================================

function getStartOfWeek(weekStartsOn: 'sunday' | 'monday' = 'sunday'): Date {
  const now = new Date();
  const day = now.getDay();

  if (weekStartsOn === 'monday') {
    const diff = day === 0 ? -6 : 1 - day;
    now.setDate(now.getDate() + diff);
  } else {
    now.setDate(now.getDate() - day);
  }

  now.setHours(0, 0, 0, 0);
  return now;
}

function getDistanceForGoalType(goalType: string): number | null {
  const distances: Record<string, number> = {
    'marathon': 42.195,
    'half_marathon': 21.0975,
    '10k': 10,
    '5k': 5,
  };
  return distances[goalType] || null;
}

function buildWeeklyInsightsFromActivities(
  activities: any[],
  weekStartsOn: 'sunday' | 'monday'
): WeeklyInsight[] {
  // Group activities by week
  const weekMap = new Map<string, any[]>();

  activities.forEach(a => {
    const activityDate = new Date(a.start_date);
    const weekStart = getStartOfWeekForDate(activityDate, weekStartsOn);
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(a);
  });

  // Build insights for each week
  const insights: WeeklyInsight[] = [];

  weekMap.forEach((weekActivities, weekStart) => {
    const totalDistanceKm = weekActivities.reduce((sum, a) =>
      sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
    );

    const activitiesWithSpeed = weekActivities.filter(a => a.average_speed);
    const avgPace = activitiesWithSpeed.length > 0
      ? activitiesWithSpeed.reduce((sum, a) =>
          sum + (1000 / (parseFloat(String(a.average_speed)) * 60)), 0) / activitiesWithSpeed.length
      : null;

    insights.push({
      weekStart,
      totalDistanceKm,
      avgPace,
      adherenceRate: 100, // Would need plan data to calculate properly
      keyInsights: [],
    });
  });

  // Sort by date descending
  insights.sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime());

  return insights.slice(0, 4); // Last 4 weeks
}

function getStartOfWeekForDate(date: Date, weekStartsOn: 'sunday' | 'monday'): Date {
  const d = new Date(date);
  const day = d.getDay();

  if (weekStartsOn === 'monday') {
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
  } else {
    d.setDate(d.getDate() - day);
  }

  d.setHours(0, 0, 0, 0);
  return d;
}

function buildLongRunProgression(activities: any[]): number[] {
  // Get activities grouped by week and find the longest run each week
  const weekMap = new Map<string, number>();

  activities.forEach(a => {
    const activityDate = new Date(a.start_date);
    const weekStart = getStartOfWeekForDate(activityDate, 'sunday');
    const weekKey = weekStart.toISOString().split('T')[0];
    const distanceKm = a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0;

    if (!weekMap.has(weekKey) || weekMap.get(weekKey)! < distanceKm) {
      weekMap.set(weekKey, distanceKm);
    }
  });

  // Convert to array sorted by date
  const entries = Array.from(weekMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  return entries.slice(-4).map(e => Math.round(e[1] * 10) / 10);
}
