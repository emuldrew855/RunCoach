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
import { UserContextData, filterProfileForCoaching, getDailyInsights, getLatestWeeklyInsight, computeMarathonMetrics } from './contextBuilder';

export type Intent = 'run_analysis' | 'plan_review' | 'progress_tracking' | 'general_chat';

/**
 * Detect if user is asking about overall/historical progress vs current week
 */
function isHistoricalProgressQuery(message?: string): boolean {
  if (!message) return false;
  const messageLower = message.toLowerCase();

  // Patterns indicating overall/historical progress review
  const historicalPatterns = [
    /overall.*progress/i,
    /overall.*training/i,
    /overall.*doing/i,
    /all.*training/i,
    /all the training/i,
    /so far/i,
    /training.*so far/i,
    /how.*doing.*overall/i,
    /rate.*progress/i,
    /rate.*training/i,
    /total.*progress/i,
    /full.*training/i,
    /entire.*training/i,
    /since.*started/i,
    /from.*beginning/i,
    /all.*work/i,
    /everything.*done/i,
    /overall.*based/i,
    /based on all/i,
    /how do you rate/i,
    /assess.*training/i,
    /evaluate.*training/i,
    /training.*journey/i,
    /training.*cycle/i,
    /how am i doing overall/i,
    /my overall/i,
    /trajectory/i,
    /on track for/i,
  ];

  const matched = historicalPatterns.some(pattern => pattern.test(messageLower));

  if (matched) {
    console.log(`📊 Historical progress query DETECTED in: "${message.substring(0, 50)}..."`);
  }

  return matched;
}

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
      // Check if this is a historical/overall progress query
      const isHistorical = isHistoricalProgressQuery(userMessage);
      if (isHistorical) {
        console.log('📊 Historical progress query detected - loading full training history');
        return buildHistoricalProgressContext(userId);
      }
      return buildProgressTrackingContext(userId);
    case 'general_chat':
      return buildGeneralChatContext(userId);
    default:
      // Fallback to general chat
      return buildGeneralChatContext(userId);
  }
}

/**
 * RUN ANALYSIS CONTEXT (~3k tokens)
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

  console.log('🏃 Run Analysis Context: Loading ONLY the specific run being discussed');

  // Get recent activities to identify which one user is asking about
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentActivities = await getActivitiesAfterDate(userId, sevenDaysAgo);

  // Identify the specific activity user is asking about
  const targetActivity = identifyTargetActivity(recentActivities, userMessage);

  console.log(`   Target activity: ${targetActivity?.name || 'Unknown'} on ${targetActivity?.start_date || 'Unknown date'}`);

  // Fetch ONLY the daily insight for this specific activity
  let dailyInsights = [];
  if (targetActivity) {
    const { query } = await import('../config/database');

    const result = await query(
      `SELECT * FROM daily_run_insights WHERE activity_id = $1`,
      [targetActivity.id]
    );

    if (result.rows.length > 0) {
      dailyInsights = [result.rows[0]];
      console.log(`   Found daily insight for activity ${targetActivity.id}`);
    } else {
      console.log(`   No daily insight found for activity ${targetActivity.id}`);
    }
  }

  // REMOVED: weeklyInsight (not relevant for single run analysis)
  // REMOVED: Multiple daily insights (only include the ONE run being discussed)

  return {
    firstName: user.first_name,
    profile: filterProfileForCoaching(profile),
    activeGoal,
    // recentActivities removed - redundant with dailyInsights
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
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },
    dailyInsights, // Only the ONE run being discussed
    weeklyInsight: undefined, // Not relevant for single run
    // REMOVED: Not needed for analyzing a single run
    raceHistory: [],
    personalBests: [],
  };
}

/**
 * PLAN REVIEW CONTEXT (~15k tokens)
 * For reviewing and modifying training plans
 * Now includes pre-computed MarathonMetrics for high-signal context
 */
async function buildPlanReviewContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);
  const activePlan = await getActivePlan(userId);

  console.log('📋 Plan Review Context: Loading upcoming workouts + goal data + Marathon Metrics');

  // Load next 2 weeks of workouts (detailed)
  const upcomingWorkouts = await getUpcomingWorkouts(userId, 14);

  // Get recent average pace ONLY (for pace suggestions context)
  const recentStats = await getActivityStats(userId, 7);

  // Get this week's workouts for marathon metrics calculation
  const weekStartsOn = profile?.week_starts_on || 'sunday';
  const startOfWeek = getStartOfWeek(weekStartsOn);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  const thisWeekWorkouts = await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek);

  // Get recent activities for marathon metrics
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);
  const thisWeekActivities = recentActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < endOfWeek;
  });

  // Get HR zone distribution for aerobic balance
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

  // COMPUTE MARATHON METRICS - High signal, low token context
  const marathonMetrics = computeMarathonMetrics(
    activeGoal,
    profile,
    thisWeekWorkouts,
    thisWeekActivities,
    hrZoneDistribution,
    recentActivities
  );

  console.log('🏃 Marathon Metrics computed for Plan Review:', JSON.stringify(marathonMetrics, null, 2));

  return {
    firstName: user.first_name,
    profile: filterProfileForCoaching(profile),
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
    recentStats, // Only for recent average pace context
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution,
    thisWeekCompleted: undefined,
    longTermMemories: [],
    sessionSummary: undefined,
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },
    // REMOVED: dailyInsights, weeklyInsight, raceHistory, personalBests (not needed for plan review)
    dailyInsights: [],
    weeklyInsight: undefined,
    raceHistory: [],
    personalBests: [],
    // NEW: Pre-computed marathon performance metrics
    marathonMetrics,
  };
}

/**
 * PROGRESS TRACKING CONTEXT (~12k tokens)
 * For analyzing progress over time periods
 * Now includes pre-computed MarathonMetrics for high-signal context
 */
async function buildProgressTrackingContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  console.log('📊 Progress Tracking Context: Loading THIS WEEK\'S data + Marathon Metrics');

  // Calculate this week's progress based on user's week start preference
  const weekStartsOn = profile?.week_starts_on || 'sunday';
  const startOfWeek = getStartOfWeek(weekStartsOn);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  console.log(`📅 Progress tracking week boundaries (${weekStartsOn} start):`);
  console.log(`   Start: ${startOfWeek.toISOString()}`);
  console.log(`   End:   ${endOfWeek.toISOString()}`);

  // Get this week's activities ONLY (no 30-day history)
  const thisWeekActivities = await getActivitiesAfterDate(userId, startOfWeek);
  const filteredThisWeekActivities = thisWeekActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < endOfWeek;
  });

  // Get this week's planned workouts (only those within this specific week)
  const thisWeekWorkouts = await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek);

  const plannedDistance = thisWeekWorkouts.reduce((sum, w) =>
    sum + (w.target_distance_meters ? w.target_distance_meters / 1000 : 0), 0
  );
  console.log(`📊 This week: ${filteredThisWeekActivities.length} activities, ${thisWeekWorkouts.length} planned workouts`);
  console.log(`📊 Planned distance: ${plannedDistance.toFixed(1)}km`);
  console.log(`📊 Planned workouts detail:`);
  thisWeekWorkouts.forEach(w => {
    console.log(`   - ${new Date(w.scheduled_date).toISOString().split('T')[0]}: ${w.name} (${w.target_distance_meters ? (w.target_distance_meters / 1000).toFixed(1) : '0'}km)`);
  });

  // Get stats for this week only
  const weekStats = await getActivityStats(userId, 7);

  // Get recent activities for 4-week trend analysis (needed for marathon metrics)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);

  // Get HR zone distribution (last 30 days for trend analysis)
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

  // Calculate average pace and HR for this week
  const activitiesWithSpeed = filteredThisWeekActivities.filter(a => a.average_speed);
  const averagePace = activitiesWithSpeed.length > 0
    ? activitiesWithSpeed.reduce((sum, a) => sum + (1000 / (parseFloat(String(a.average_speed)) * 60)), 0) / activitiesWithSpeed.length
    : undefined;

  const activitiesWithHR = filteredThisWeekActivities.filter(a => a.average_heartrate);
  const averageHeartRate = activitiesWithHR.length > 0
    ? Math.round(activitiesWithHR.reduce((sum, a) => sum + parseFloat(String(a.average_heartrate)), 0) / activitiesWithHR.length)
    : undefined;

  // Split workouts into past (should be done) and upcoming (today/future)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const pastWorkouts = thisWeekWorkouts.filter(w => new Date(w.scheduled_date) < todayStart);
  const upcomingWorkouts = thisWeekWorkouts.filter(w => new Date(w.scheduled_date) >= todayStart);

  console.log(`📊 Split: ${pastWorkouts.length} past workouts (should be done), ${upcomingWorkouts.length} upcoming (today+future)`);

  // Calculate adherence ONLY for past workouts (contextual)
  const thisWeekCompleted = {
    activities: filteredThisWeekActivities.map(a => ({
      date: a.start_date,
      name: a.name,
      distance: a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0,
      duration: a.moving_time_seconds,
      pace: a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : undefined,
      avgHR: a.average_heartrate ? Math.round(parseFloat(String(a.average_heartrate))) : undefined,
      maxHR: a.max_heartrate ? Math.round(parseFloat(String(a.max_heartrate))) : undefined,
      elevationGain: a.total_elevation_gain_meters,
    })),
    totalDistance: filteredThisWeekActivities.reduce((sum, a) =>
      sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
    ),
    totalDuration: filteredThisWeekActivities.reduce((sum, a) => sum + (a.moving_time_seconds || 0), 0),
    workoutCount: filteredThisWeekActivities.length,
    averagePace,
    averageHeartRate,
    adherence: pastWorkouts.length > 0 ? {
      plannedWorkouts: pastWorkouts.length,
      completedActivities: filteredThisWeekActivities.length,
      plannedDistance: pastWorkouts.reduce((sum, w) =>
        sum + (w.target_distance_meters ? w.target_distance_meters / 1000 : 0), 0
      ),
      actualDistance: filteredThisWeekActivities.reduce((sum, a) =>
        sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
      ),
      adherenceRate: Math.round((filteredThisWeekActivities.length / pastWorkouts.length) * 100),
    } : undefined,
  };

  // Map upcoming workouts for context (what's remaining this week - today + future)
  const plannedWorkoutsForContext = upcomingWorkouts.map(w => ({
    id: w.id,
    date: w.scheduled_date,
    type: w.workout_type,
    name: w.name,
    description: w.description,
    targetDistance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
    targetDuration: w.target_duration_seconds,
    targetPace: formatPace(w.target_pace_avg),
    targetPaceRange: w.target_pace_min && w.target_pace_max ?
      `${formatPace(w.target_pace_min)} - ${formatPace(w.target_pace_max)}` : undefined,
    hrZone: w.target_hr_zone,
    targetHRRange: w.target_hr_min && w.target_hr_max ?
      `${w.target_hr_min} - ${w.target_hr_max} bpm` : undefined,
    intervals: w.intervals,
    coachNotes: w.coach_notes,
    completionStatus: w.completion_status,
  }));

  // COMPUTE MARATHON METRICS - High signal, low token context
  const marathonMetrics = computeMarathonMetrics(
    activeGoal,
    profile,
    thisWeekWorkouts,
    filteredThisWeekActivities,
    hrZoneDistribution,
    recentActivities
  );

  console.log('🏃 Marathon Metrics computed:', JSON.stringify(marathonMetrics, null, 2));

  return {
    firstName: user.first_name,
    profile: filterProfileForCoaching(profile),
    activeGoal,
    recentStats: weekStats,
    activePlan: null, // Not needed for progress tracking
    upcomingWorkouts: plannedWorkoutsForContext, // THIS WEEK's planned workouts for adherence analysis
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution,
    thisWeekCompleted,
    longTermMemories: [],
    sessionSummary: undefined,
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },
    // REMOVED: Not needed for progress tracking
    dailyInsights: [],
    weeklyInsight: undefined,
    raceHistory: [],
    personalBests: [],
    // NEW: Pre-computed marathon performance metrics
    marathonMetrics,
  };
}

/**
 * HISTORICAL PROGRESS CONTEXT (~18k tokens)
 * For analyzing OVERALL training progress since the beginning
 * Used when user asks about "overall progress", "all training so far", etc.
 *
 * KEY IMPROVEMENT: Segments history into pre-plan vs plan periods
 * to prevent incorrect analysis like "low adherence" when user just started
 * following a structured plan.
 */
async function buildHistoricalProgressContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);
  const activePlan = await getActivePlan(userId);

  console.log('📊 Historical Progress Context: Loading SEGMENTED training history');

  // Import training context builder functions
  const {
    buildTrainingContext,
    buildWeeklyBreakdown,
    summarizeWeeks,
    buildLongRunProgression,
    calculatePlanAdherenceFromWorkouts,
  } = await import('./trainingContextBuilder');

  // Load last 12 weeks of activities (full training cycle)
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 weeks
  const allActivities = await getActivitiesAfterDate(userId, twelveWeeksAgo);

  console.log(`📊 Loaded ${allActivities.length} activities from last 12 weeks`);

  // Get plan start date for segmentation
  const planStartDate = activePlan ? new Date(activePlan.start_date) : null;

  // Segment activities into pre-plan and plan periods
  const prePlanActivities = planStartDate
    ? allActivities.filter(a => new Date(a.start_date) < planStartDate)
    : [];
  const planActivities = planStartDate
    ? allActivities.filter(a => new Date(a.start_date) >= planStartDate)
    : allActivities;

  console.log(`📊 Segmented: ${prePlanActivities.length} pre-plan activities, ${planActivities.length} plan activities`);

  // Get week start preference
  const weekStartsOn = (profile?.week_starts_on || 'sunday') as 'sunday' | 'monday';

  // Build weekly breakdowns for each segment
  const prePlanWeekly = buildWeeklyBreakdown(prePlanActivities, weekStartsOn);
  const planWeekly = buildWeeklyBreakdown(planActivities, weekStartsOn);

  // Build training context (temporal awareness)
  const trainingContext = buildTrainingContext(activePlan, activeGoal);

  // Build segmented training history
  const trainingHistory = {
    prePlanHistory: prePlanWeekly.length > 0 ? {
      weeks: prePlanWeekly.length,
      purpose: 'baseline fitness and running habits',
      weeklyBreakdown: prePlanWeekly,
      summary: summarizeWeeks(prePlanWeekly),
    } : null,
    planHistory: {
      weeks: planWeekly.length,
      purpose: 'structured marathon preparation',
      weeklyBreakdown: planWeekly,
      summary: summarizeWeeks(planWeekly),
    },
  };

  // Calculate plan adherence ONLY since plan start
  const plannedWorkouts = planStartDate
    ? await getPlannedWorkoutsByDateRange(userId, planStartDate, new Date())
    : [];
  const planAdherence = planStartDate
    ? calculatePlanAdherenceFromWorkouts(plannedWorkouts, planStartDate)
    : null;

  // Build long run progression
  const longRunProgression = buildLongRunProgression(planActivities, prePlanActivities, activeGoal);

  // Get HR zone distribution for full period
  const hrZoneData = await getHRZoneSummary(userId, 84); // 12 weeks
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

  // Log summary
  console.log('📊 Historical Progress Summary:', JSON.stringify({
    trainingContext: trainingContext ? {
      weeksIntoBlock: trainingContext.weeksIntoBlock,
      weeksRemaining: trainingContext.weeksRemaining,
      currentPhase: trainingContext.currentPhase,
    } : null,
    prePlanWeeks: prePlanWeekly.length,
    planWeeks: planWeekly.length,
    planAdherence: planAdherence?.sincePlanStart.adherenceRate,
    longRunProgression: longRunProgression.sincePlanStart,
  }, null, 2));

  return {
    firstName: user.first_name,
    profile: filterProfileForCoaching(profile),
    activeGoal,
    activePlan: activePlan ? {
      name: activePlan.name,
      startDate: activePlan.start_date,
      endDate: activePlan.end_date,
      totalWeeks: activePlan.total_weeks,
    } : null,
    upcomingWorkouts: [], // Not needed for historical review
    recentStats: null,
    thisWeekPlan: undefined,
    nextFourWeeksPlan: undefined,
    lastWeekAdherence: undefined,
    lastFourWeeksAdherence: undefined,
    hrZoneDistribution,
    thisWeekCompleted: undefined,
    longTermMemories: [],
    sessionSummary: undefined,
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },
    dailyInsights: [],
    weeklyInsight: undefined,
    raceHistory: [],
    personalBests: [],
    // NEW: Training Context Layer
    trainingContext,
    trainingHistory,
    planAdherence,
    longRunProgression,
  };
}

/**
 * GENERAL CHAT CONTEXT (~3k tokens)
 * For general questions, motivation, quick advice
 */
async function buildGeneralChatContext(userId: number): Promise<UserContextData> {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  console.log('💬 General Chat Context: Loading minimal data - just recent stats and insights');

  // Just load basic current week summary
  const weekStats = await getActivityStats(userId, 7);

  // Fetch daily insights (last 7 days) and weekly insight
  const dailyInsights = await getDailyInsights(userId, 7);
  const weeklyInsight = await getLatestWeeklyInsight(userId);

  // REMOVED: recentActivities (redundant with dailyInsights)
  // REMOVED: raceHistory and personalBests (not needed for general questions)

  return {
    firstName: user.first_name,
    profile: filterProfileForCoaching(profile),
    activeGoal,
    // recentActivities removed - redundant with dailyInsights
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
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },
    dailyInsights,
    weeklyInsight,
    // REMOVED: Not needed for general questions
    raceHistory: [],
    personalBests: [],
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
function getWeekLabel(workoutDate: Date | string): string {
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
 * Helper: Get start of current week based on user preference
 */
function getStartOfWeek(weekStartsOn: 'sunday' | 'monday' = 'sunday'): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  if (weekStartsOn === 'monday') {
    // Monday start: if today is Sunday (0), go back 6 days; otherwise go back (day - 1) days
    const diff = day === 0 ? -6 : 1 - day;
    now.setDate(now.getDate() + diff);
  } else {
    // Sunday start: go back 'day' days
    now.setDate(now.getDate() - day);
  }

  now.setHours(0, 0, 0, 0);
  return now;
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
 * Updated estimates after optimization (removed irrelevant data per intent)
 */
export function getEstimatedTokenCount(intent: Intent): number {
  const estimates: Record<Intent, number> = {
    run_analysis: 6000,        // Reduced: removed race history, personal bests
    plan_review: 12000,        // Reduced: removed daily insights, race history, personal bests
    progress_tracking: 14000,  // Includes THIS WEEK's planned workouts + completed activities + adherence
    general_chat: 3000,        // Reduced: removed race history, personal bests
  };
  return estimates[intent];
}
