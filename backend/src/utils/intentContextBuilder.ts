/**
 * Intent-Based Context Builders
 *
 * Specialized context builders that load only relevant data based on user intent.
 * Reduces token usage by 60-87% compared to loading full context.
 */

import { getUserById } from '../models/User';
import { getProfileByUserId } from '../models/UserProfile';
import { getActiveGoal } from '../models/Goal';
import { getActivitiesAfterDate, getActivityStats, getActivitiesByUserId } from '../models/Activity';
import { getActivePlan } from '../models/TrainingPlan';
import { getUpcomingWorkouts, getPlannedWorkoutsByDateRange } from '../models/PlannedWorkout';
import { getHRZoneSummary } from '../models/ActivityHRZone';
import { UserContextData } from './contextBuilder';

export type Intent = 'run_analysis' | 'plan_review' | 'progress_tracking' | 'general_chat';

/**
 * Build context based on detected intent
 * Routes to specialized builder to minimize token usage
 */
export async function buildContextForIntent(
  userId: number,
  intent: Intent,
  userMessage?: string
): Promise<UserContextData> {
  console.log(`🎯 Building context for intent: ${intent}`);

  switch (intent) {
    case 'run_analysis':
      return buildRunAnalysisContext(userId, userMessage);
    case 'plan_review':
      return buildPlanReviewContext(userId);
    case 'progress_tracking':
      return buildProgressTrackingContext(userId);
    case 'general_chat':
      return buildGeneralChatContext(userId);
    default:
      // Fallback to general chat
      return buildGeneralChatContext(userId);
  }
}

/**
 * RUN ANALYSIS CONTEXT (~8k tokens)
 * For analyzing specific completed activities
 */
async function buildRunAnalysisContext(
  userId: number,
  userMessage?: string
): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  // Load last 7 days of activities (includes recent context)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActivities = await getActivitiesAfterDate(userId, sevenDaysAgo);

  // Try to identify which activity user is asking about
  const targetActivity = identifyTargetActivity(recentActivities, userMessage);

  // If we found the target activity, put it first
  if (targetActivity) {
    const filtered = recentActivities.filter(a => a.id !== targetActivity.id);
    recentActivities.splice(0, 0, targetActivity); // Put target first
  }

  // Limit to last 5 activities for comparison
  const limitedActivities = recentActivities.slice(0, 5);

  return {
    firstName: user.first_name,
    profile,
    activeGoal,
    recentActivities: limitedActivities,
    recentStats: null, // Not needed for run analysis
    activePlan: null, // Not needed
    upcomingWorkouts: [], // Not needed
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution: undefined,
    thisWeekCompleted: undefined,
    longTermMemories: [],
    sessionSummary: undefined,
  };
}

/**
 * PLAN REVIEW CONTEXT (~15k tokens)
 * For reviewing and modifying training plans
 */
async function buildPlanReviewContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);
  const activePlan = await getActivePlan(userId);

  // Load next 2 weeks of workouts (detailed)
  const today = new Date();
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(today.getDate() + 14);

  const upcomingWorkouts = await getUpcomingWorkouts(userId, 14);

  // Load last 7 days of completed activities for context
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActivities = await getActivitiesAfterDate(userId, sevenDaysAgo);

  // Calculate recent performance trends (last 7 days)
  const recentStats = await getActivityStats(userId, 7);

  return {
    firstName: user.first_name,
    profile,
    activeGoal,
    activePlan: activePlan ? {
      name: activePlan.name,
      startDate: activePlan.start_date,
      endDate: activePlan.end_date,
      totalWeeks: activePlan.total_weeks,
    } : null,
    upcomingWorkouts: upcomingWorkouts.map(w => ({
      id: w.id,
      date: w.scheduled_date,
      type: w.workout_type,
      name: w.name,
      description: w.description,
      targetDistance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
      targetPace: formatPace(w.target_pace_avg),
      hrZone: w.target_hr_zone,
      weekLabel: getWeekLabel(w.scheduled_date),
    })),
    recentActivities: recentActivities.slice(0, 7), // Last 7 days
    recentStats,
    thisWeekPlan: undefined, // Not needed for plan review
    nextFourWeeksPlan: undefined, // Simplified - only need next 2 weeks
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution: undefined,
    thisWeekCompleted: undefined,
    longTermMemories: [],
    sessionSummary: undefined,
  };
}

/**
 * PROGRESS TRACKING CONTEXT (~12k tokens)
 * For analyzing progress over time periods
 */
async function buildProgressTrackingContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  // Load last 30 days of activities
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);

  // Get stats for different periods
  const weekStats = await getActivityStats(userId, 7);
  const monthStats = await getActivityStats(userId, 30);

  // Get HR zone distribution (last 30 days)
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

  // Calculate this week's progress
  const startOfWeek = getStartOfWeek();
  const thisWeekActivities = recentActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < new Date();
  });

  // Get this week's planned workouts
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const thisWeekWorkouts = await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek);

  // Calculate adherence
  const thisWeekCompleted = {
    activities: thisWeekActivities.map(a => ({
      date: a.start_date,
      name: a.name,
      distance: a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0,
      duration: a.moving_time_seconds,
      pace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : undefined,
      avgHR: a.average_heartrate ? Math.round(parseFloat(String(a.average_heartrate))) : undefined,
      maxHR: a.max_heartrate ? Math.round(parseFloat(String(a.max_heartrate))) : undefined,
      elevationGain: a.total_elevation_gain_meters,
    })),
    totalDistance: thisWeekActivities.reduce((sum, a) =>
      sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
    ),
    totalDuration: thisWeekActivities.reduce((sum, a) => sum + (a.moving_time_seconds || 0), 0),
    workoutCount: thisWeekActivities.length,
    adherence: thisWeekWorkouts.length > 0 ? {
      plannedWorkouts: thisWeekWorkouts.length,
      completedActivities: thisWeekActivities.length,
      plannedDistance: thisWeekWorkouts.reduce((sum, w) =>
        sum + (w.target_distance_meters ? w.target_distance_meters / 1000 : 0), 0
      ),
      actualDistance: thisWeekActivities.reduce((sum, a) =>
        sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
      ),
      adherenceRate: Math.round((thisWeekActivities.length / thisWeekWorkouts.length) * 100),
    } : undefined,
  };

  return {
    firstName: user.first_name,
    profile,
    activeGoal,
    recentActivities,
    recentStats: weekStats,
    activePlan: null, // Not needed for progress tracking
    upcomingWorkouts: [], // Not needed
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution,
    thisWeekCompleted,
    longTermMemories: [],
    sessionSummary: undefined,
  };
}

/**
 * GENERAL CHAT CONTEXT (~5k tokens)
 * For general questions, motivation, quick advice
 */
async function buildGeneralChatContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  // Just load basic current week summary
  const today = new Date();
  const startOfWeek = getStartOfWeek();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  const recentActivities = await getActivitiesAfterDate(userId, sevenDaysAgo);
  const weekStats = await getActivityStats(userId, 7);

  return {
    firstName: user.first_name,
    profile,
    activeGoal,
    recentActivities: recentActivities.slice(0, 3), // Just last 3 activities
    recentStats: weekStats,
    activePlan: null,
    upcomingWorkouts: [],
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution: undefined,
    thisWeekCompleted: undefined,
    longTermMemories: [],
    sessionSummary: undefined,
  };
}

/**
 * Helper: Identify which activity user is asking about based on message
 */
function identifyTargetActivity(activities: any[], userMessage?: string): any | null {
  if (!userMessage) return activities[0]; // Default to most recent

  const messageLower = userMessage.toLowerCase();

  // Check for time references
  if (messageLower.includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    return activities.find(a => {
      const activityDate = new Date(a.start_date).toISOString().split('T')[0];
      return activityDate === yesterdayStr;
    }) || activities[0];
  }

  if (messageLower.includes('today') || messageLower.includes('this morning')) {
    const todayStr = new Date().toISOString().split('T')[0];

    return activities.find(a => {
      const activityDate = new Date(a.start_date).toISOString().split('T')[0];
      return activityDate === todayStr;
    }) || activities[0];
  }

  // Check for workout type mentions
  const workoutTypes = ['tempo', 'long run', 'interval', 'easy', 'recovery'];
  for (const type of workoutTypes) {
    if (messageLower.includes(type)) {
      return activities.find(a =>
        a.name?.toLowerCase().includes(type) || a.workout_type?.toLowerCase().includes(type)
      ) || activities[0];
    }
  }

  // Default to most recent
  return activities[0];
}

/**
 * Helper: Get week label for workout date
 */
function getWeekLabel(workoutDate: Date): string {
  const today = new Date();
  const startOfThisWeek = getStartOfWeek();
  const endOfThisWeek = new Date(startOfThisWeek);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 7);

  const workout = new Date(workoutDate);

  if (workout >= startOfThisWeek && workout < endOfThisWeek) {
    return 'this_week';
  }

  const startOfNextWeek = new Date(endOfThisWeek);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  if (workout >= startOfNextWeek && workout < endOfNextWeek) {
    return 'next_week';
  }

  const startOfWeek3 = new Date(endOfNextWeek);
  const endOfWeek3 = new Date(startOfWeek3);
  endOfWeek3.setDate(endOfWeek3.getDate() + 7);

  if (workout >= startOfWeek3 && workout < endOfWeek3) {
    return 'week_3';
  }

  return 'week_4';
}

/**
 * Helper: Get start of current week (Monday)
 */
function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Helper: Format pace
 */
function formatPace(pace?: number): string | undefined {
  if (!pace) return undefined;
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get estimated token count for intent
 */
export function getEstimatedTokenCount(intent: Intent): number {
  const estimates: Record<Intent, number> = {
    run_analysis: 8000,
    plan_review: 15000,
    progress_tracking: 12000,
    general_chat: 5000,
  };
  return estimates[intent];
}
