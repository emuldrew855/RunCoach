import { getUserById } from '../models/User';
import { getProfileByUserId } from '../models/UserProfile';
import { getActiveGoal } from '../models/Goal';
import { getActivitiesAfterDate, getActivityStats } from '../models/Activity';
import { getActivePlan } from '../models/TrainingPlan';
import { getUpcomingWorkouts, getPlannedWorkoutsByDateRange } from '../models/PlannedWorkout';
import { getHRZoneSummary } from '../models/ActivityHRZone';
import { getRaceHistoryByUserId, getPersonalBests } from '../models/RaceHistory';
import { retrieveRelevantMemories, type LongTermMemory } from '../services/memoryRetrievalService';
import { DailyRunInsight, WeeklyInsight, RunnerTendency } from '../types/insights';
import { MarathonMetrics, TrainingContext, SegmentedTrainingHistory, PlanAdherence, LongRunProgression } from '../types/models';
import pool from '../config/database';

/**
 * Filter profile to only coaching-relevant fields
 * Excludes UI-specific settings that aren't needed for coaching
 */
export function filterProfileForCoaching(profile: any) {
  if (!profile) return null;

  return {
    age: profile.age,
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    gender: profile.gender,
    running_experience_years: profile.running_experience_years,
    typical_weekly_mileage: profile.typical_weekly_mileage,
    injury_history: profile.injury_history,
    training_block_start: profile.training_block_start,
    training_block_end: profile.training_block_end,
    coach_style: profile.coach_style,
    coach_strictness_level: profile.coach_strictness_level,
    coach_communication_style: profile.coach_communication_style,
    // HR zones sent separately in hrZones field
    // Excluded: chart_preferences, preferred_units, week_starts_on, timezone, personal_bests
  };
}

export interface UserContextData {
  firstName: string;
  profile: any; // Filtered to coaching-relevant fields only
  activeGoal: any;
  recentStats: any;
  recentActivities?: any[]; // Recent activities for analysis
  thisWeekCompleted?: any; // This week's completed workouts summary
  longTermMemories?: any; // Long-term memory data
  activePlan?: {
    name: string;
    startDate: Date;
    endDate: Date;
    totalWeeks?: number;
  } | null;
  upcomingWorkouts?: Array<{
    id: number;  // Added workout ID
    date: Date | string;
    type: string;
    name?: string;
    description?: string;
    targetDistance?: number;
    targetPace?: string;
    hrZone?: number;
    weekLabel?: string;  // Added week label: 'this_week' | 'next_week' | 'week_3' | 'week_4'
  }>;
  lastWeekAdherence?: {
    planned: number;
    completed: number;
    skipped: number;
  };
  lastFourWeeksAdherence?: {
    plannedDistance: number;
    actualDistance: number;
    adherenceRate: number;
  };
  thisWeekPlan?: {
    workouts: Array<{
      date: Date | string;
      type: string;
      name?: string;
      distance?: number;
      hrZone?: number;
      description?: string;
    }>;
    totalPlannedDistance: number;
    completedDistance: number;
  };
  nextFourWeeksPlan?: {
    week1Distance: number;
    week2Distance: number;
    week3Distance: number;
    week4Distance: number;
  };
  goalProgress?: {
    weeksRemaining: number;
    avgWeeklyMileageNeeded: number;
    currentAvgWeeklyMileage: number;
    onTrack: boolean;
  };
  hrZoneDistribution?: {
    zone1Hours: number;
    zone2Hours: number;
    zone3Hours: number;
    zone4Hours: number;
    zone5Hours: number;
    totalHours: number;
  } | null;
  hrZones?: {
    zone1Max: number;
    zone2Max: number;
    zone3Max: number;
    zone4Max: number;
    zone5Max: number;
  };
  sessionSummary?: {
    trainingCycleWeek: number;
    recentTrend: {
      mileageDirection: string;
      adherenceStatus: string;
      intensityLevel: string;
    };
    keyContext: {
      raceDateProximity: number;
      trainingPhase: string;
      recentConcerns: string | null;
    };
  };
  longTermMemory?: LongTermMemory; // Phase 2: RAG-based semantic memory
  dailyInsights?: DailyRunInsight[]; // NEW: Pre-computed daily insights (last 7 days)
  weeklyInsight?: WeeklyInsight | null; // NEW: Latest weekly insight
  runnerTendencies?: RunnerTendency[]; // NEW Phase 2: Behavioral patterns over 4-6 weeks
  raceHistory?: any[]; // User's race history
  personalBests?: any[]; // User's personal best times
  marathonMetrics?: MarathonMetrics; // Pre-computed marathon performance metrics
  historicalProgress?: {
    weeksAnalyzed: number;
    totalDistance: number;
    totalDuration: number;
    totalRuns: number;
    weeklyBreakdown: Array<{
      weekNumber: number;
      weekStart: string;
      distance: number;
      duration: number;
      runCount: number;
      averagePace?: number;
      averageHR?: number;
      longestRun: number;
    }>;
    volumeTrend: number; // % change from first 4 weeks to last 4 weeks
    first4WeeksAvg: number;
    last4WeeksAvg: number;
    planAdherence?: {
      totalPlanned: number;
      completed: number;
      skipped: number;
      adherenceRate: number;
    };
  }; // Historical training data for overall progress queries

  // NEW: Training Context Layer - helps LLM distinguish pre-plan from structured training
  trainingContext?: TrainingContext;
  trainingHistory?: SegmentedTrainingHistory;
  planAdherence?: PlanAdherence;
  longRunProgression?: LongRunProgression;
}

export async function buildUserContext(userId: number, userQuery?: string): Promise<UserContextData> {
  const user = await getUserById(userId);
  const profile = await getProfileByUserId(userId);
  const activeGoal = await getActiveGoal(userId);

  // Debug logging for profile and goal data
  console.log('\n========== CONTEXT BUILDER: DATABASE FETCH DEBUG ==========');
  console.log('User ID:', userId);
  console.log('\n--- PROFILE FROM DATABASE ---');
  console.log('Profile exists:', !!profile);
  if (profile) {
    console.log('HR Zone 1 Max:', profile.hr_zone_1_max);
    console.log('HR Zone 2 Max:', profile.hr_zone_2_max);
    console.log('HR Zone 3 Max:', profile.hr_zone_3_max);
    console.log('HR Zone 4 Max:', profile.hr_zone_4_max);
    console.log('HR Zone 5 Max:', profile.hr_zone_5_max);
  }
  console.log('\n--- ACTIVE GOAL FROM DATABASE ---');
  console.log('Goal exists:', !!activeGoal);
  if (activeGoal) {
    console.log('Goal Type:', activeGoal.goal_type);
    console.log('Race Name:', activeGoal.race_name);
    console.log('Target Date:', activeGoal.target_date);
    console.log('Target Time (seconds):', activeGoal.target_time_seconds);
    console.log('Is Active:', activeGoal.is_active);
  }
  console.log('========== END DATABASE FETCH DEBUG ==========\n');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentActivities = await getActivitiesAfterDate(userId, thirtyDaysAgo);
  const recentStats = await getActivityStats(userId, 30);

  // Get active training plan
  const activePlan = await getActivePlan(userId);

  // Get upcoming workouts (next 7 days for immediate schedule, then 28 days for 4 weeks lookahead)
  const next7DaysWorkouts = activePlan ? await getUpcomingWorkouts(userId, 7) : [];
  const upcomingWorkouts = activePlan ? await getUpcomingWorkouts(userId, 28) : [];

  // Get last week's planned vs actual
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const lastWeekPlanned = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, weekAgo, new Date())
    : [];

  // Get last 4 weeks of planned workouts for trend analysis
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const lastFourWeeksPlanned = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, fourWeeksAgo, new Date())
    : [];

  // Get HR zone distribution
  const hrZoneSummary = await getHRZoneSummary(userId, 30);

  // NEW: Fetch daily insights (last 7 days) and weekly insight
  const dailyInsights = await getDailyInsights(userId, 7);
  const weeklyInsight = await getLatestWeeklyInsight(userId);

  // NEW Phase 2: Fetch runner tendencies (behavioral patterns)
  const runnerTendencies = await getRunnerTendencies(userId);

  // Fetch race history and personal bests
  const raceHistory = await getRaceHistoryByUserId(userId);
  const personalBests = await getPersonalBests(userId);

  // Calculate this week's plan based on user's week start preference
  const weekStartsOn = profile?.week_starts_on || 'sunday';
  const startOfWeek = new Date();
  const day = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.

  if (weekStartsOn === 'monday') {
    // Monday start: if today is Sunday (0), go back 6 days; otherwise go back (day - 1) days
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
  } else {
    // Sunday start: go back 'day' days
    startOfWeek.setDate(startOfWeek.getDate() - day);
  }

  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  // IMPORTANT: For thisWeekPlan, we need ALL workouts for this week (including past days and completed ones)
  // getUpcomingWorkouts only returns future incomplete workouts, which gives wrong totals
  const allThisWeekWorkouts = activePlan
    ? await getPlannedWorkoutsByDateRange(userId, startOfWeek, endOfWeek)
    : [];

  console.log('🗓️ This Week Calculation:', {
    weekStartsOn,
    startOfWeek: startOfWeek.toISOString(),
    endOfWeek: endOfWeek.toISOString(),
    workoutsFound: allThisWeekWorkouts.length,
    workouts: allThisWeekWorkouts.map(w => ({
      date: w.scheduled_date,
      name: w.name,
      distance: w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0,
      status: w.completion_status
    }))
  });

  const thisWeekPlan = allThisWeekWorkouts.length > 0 ? {
    workouts: allThisWeekWorkouts.map(w => ({
      date: w.scheduled_date,
      type: w.workout_type,
      name: w.name,
      distance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
      hrZone: w.target_hr_zone,
      description: w.description,
    })),
    totalPlannedDistance: allThisWeekWorkouts.reduce((sum, w) =>
      sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
    ),
    completedDistance: allThisWeekWorkouts
      .filter(w => w.completion_status === 'completed')
      .reduce((sum, w) => sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0),
  } : undefined;

  // Get this week's completed activities
  const thisWeekActivities = recentActivities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startOfWeek && activityDate < new Date();
  });

  // Calculate detailed performance metrics for this week
  const paces = thisWeekActivities
    .filter(a => a.average_speed && parseFloat(String(a.average_speed)) > 0)
    .map(a => 1000 / (parseFloat(String(a.average_speed)) * 60));

  const avgPaceThisWeek = paces.length > 0
    ? paces.reduce((sum, p) => sum + p, 0) / paces.length
    : undefined;

  const heartRates = thisWeekActivities
    .filter(a => a.average_heartrate)
    .map(a => parseFloat(String(a.average_heartrate)));

  const avgHRThisWeek = heartRates.length > 0
    ? Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length)
    : undefined;

  const thisWeekCompletedSummary = {
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
    totalDuration: thisWeekActivities.reduce((sum, a) =>
      sum + (a.moving_time_seconds ? parseFloat(String(a.moving_time_seconds)) : 0), 0
    ),
    workoutCount: thisWeekActivities.length,
    averagePace: avgPaceThisWeek,
    averageHeartRate: avgHRThisWeek,
    // Calculate actual adherence: compare activities vs planned workouts
    adherence: allThisWeekWorkouts.length > 0 ? {
      plannedWorkouts: allThisWeekWorkouts.length,
      completedActivities: thisWeekActivities.length,
      plannedDistance: allThisWeekWorkouts.reduce((sum: number, w: any) =>
        sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
      ),
      actualDistance: thisWeekActivities.reduce((sum, a) =>
        sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
      ),
      adherenceRate: Math.round((thisWeekActivities.length / allThisWeekWorkouts.length) * 100),
    } : undefined,
  };

  // Calculate next 4 weeks planned distances
  const nextFourWeeks = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(endOfWeek);
    weekStart.setDate(weekStart.getDate() + (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekWorkouts = upcomingWorkouts.filter(w => {
      const wDate = new Date(w.scheduled_date);
      return wDate >= weekStart && wDate < weekEnd;
    });

    nextFourWeeks.push(
      weekWorkouts.reduce((sum, w) =>
        sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
      )
    );
  }

  // Calculate last 4 weeks adherence
  const lastFourWeeksPlannedDistance = lastFourWeeksPlanned.reduce((sum, w) =>
    sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
  );
  const lastFourWeeksActualDistance = parseFloat(recentStats.total_distance) / 1000;
  const lastFourWeeksAdherence = lastFourWeeksPlannedDistance > 0 ? {
    plannedDistance: lastFourWeeksPlannedDistance,
    actualDistance: lastFourWeeksActualDistance,
    adherenceRate: (lastFourWeeksActualDistance / lastFourWeeksPlannedDistance) * 100,
  } : undefined;

  // Calculate goal progress
  let goalProgress = undefined;
  if (activeGoal?.target_date) {
    const weeksRemaining = Math.ceil(
      (new Date(activeGoal.target_date).getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    // Estimate needed mileage based on goal type
    const goalMileageMap: Record<string, number> = {
      'marathon': 55, // avg weekly km for marathon
      'half_marathon': 40,
      '10k': 30,
      '5k': 25,
    };

    const avgWeeklyMileageNeeded = goalMileageMap[activeGoal.goal_type] || 40;
    const currentAvgWeeklyMileage = (parseFloat(recentStats.total_distance) / 1000) / 4; // last 4 weeks avg

    goalProgress = {
      weeksRemaining,
      avgWeeklyMileageNeeded,
      currentAvgWeeklyMileage,
      onTrack: currentAvgWeeklyMileage >= avgWeeklyMileageNeeded * 0.8, // within 80%
    };
  }

  const contextData = {
    firstName: user?.first_name || 'there',
    // Filter profile to only coaching-relevant fields (exclude UI settings)
    profile: filterProfileForCoaching(profile),
    activeGoal,
    recentStats: {
      totalRuns: parseInt(recentStats.total_runs) || 0,
      totalDistance: parseFloat(recentStats.total_distance) / 1000 || 0, // Convert to km
      averagePace: recentStats.avg_speed ? (1000 / (parseFloat(recentStats.avg_speed) * 60)) : 0, // min/km
      totalElevation: parseFloat(recentStats.total_elevation) || 0,
      longestRun: parseFloat(recentStats.longest_run) / 1000 || 0, // Convert to km
    },
    // Keep recentActivities for alert service filtering (it needs activity dates)
    recentActivities,

    // Training plan data
    activePlan: activePlan ? {
      name: activePlan.name,
      startDate: activePlan.start_date,
      endDate: activePlan.end_date,
      totalWeeks: activePlan.total_weeks,
    } : null,

    // Show ALL workouts in next 28 days with explicit week labels
    upcomingWorkouts: upcomingWorkouts.map(w => {
      const workoutDate = new Date(w.scheduled_date);
      let weekLabel = 'future';

      // Determine which week this workout belongs to
      if (workoutDate >= startOfWeek && workoutDate < endOfWeek) {
        weekLabel = 'this_week';
      } else if (workoutDate >= endOfWeek) {
        const weeksFromNow = Math.floor((workoutDate.getTime() - endOfWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksFromNow === 0) weekLabel = 'next_week';
        else if (weeksFromNow === 1) weekLabel = 'week_3';
        else if (weeksFromNow === 2) weekLabel = 'week_4';
      }

      return {
        id: w.id,  // CRITICAL: workout ID for tools
        date: w.scheduled_date,
        type: w.workout_type,
        name: w.name,
        description: w.description,
        targetDistance: w.target_distance_meters ? w.target_distance_meters / 1000 : undefined,
        targetPace: w.target_pace_min && w.target_pace_max
          ? `${formatPace(w.target_pace_min)}-${formatPace(w.target_pace_max)}`
          : undefined,
        hrZone: w.target_hr_zone,
        weekLabel,  // NEW: explicit week grouping
      };
    }),

    thisWeekPlan,
    thisWeekCompleted: thisWeekCompletedSummary,

    nextFourWeeksPlan: nextFourWeeks.length === 4 ? {
      week1Distance: nextFourWeeks[0],
      week2Distance: nextFourWeeks[1],
      week3Distance: nextFourWeeks[2],
      week4Distance: nextFourWeeks[3],
    } : undefined,

    lastWeekAdherence: lastWeekPlanned.length > 0 ? {
      planned: lastWeekPlanned.length,
      completed: lastWeekPlanned.filter(w => w.completion_status === 'completed').length,
      skipped: lastWeekPlanned.filter(w => w.completion_status === 'skipped').length,
    } : undefined,

    lastFourWeeksAdherence,
    goalProgress,

    hrZoneDistribution: hrZoneSummary && (
      parseFloat(String(hrZoneSummary.total_zone_1 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_2 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_3 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_4 || 0)) +
      parseFloat(String(hrZoneSummary.total_zone_5 || 0))
    ) > 0 ? {
      zone1Hours: parseFloat(String(hrZoneSummary.total_zone_1 || 0)) / 3600,
      zone2Hours: parseFloat(String(hrZoneSummary.total_zone_2 || 0)) / 3600,
      zone3Hours: parseFloat(String(hrZoneSummary.total_zone_3 || 0)) / 3600,
      zone4Hours: parseFloat(String(hrZoneSummary.total_zone_4 || 0)) / 3600,
      zone5Hours: parseFloat(String(hrZoneSummary.total_zone_5 || 0)) / 3600,
      totalHours: (
        parseFloat(String(hrZoneSummary.total_zone_1 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_2 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_3 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_4 || 0)) +
        parseFloat(String(hrZoneSummary.total_zone_5 || 0))
      ) / 3600,
    } : null,

    // User's custom HR zones (from profile)
    hrZones: {
      zone1Max: profile?.hr_zone_1_max || 120,
      zone2Max: profile?.hr_zone_2_max || 140,
      zone3Max: profile?.hr_zone_3_max || 160,
      zone4Max: profile?.hr_zone_4_max || 175,
      zone5Max: profile?.hr_zone_5_max || 220,
    },

    // Session Summary (medium-term memory)
    sessionSummary: {
      trainingCycleWeek: calculateCurrentWeek(activePlan?.start_date),
      recentTrend: {
        mileageDirection: calculateMileageTrend(nextFourWeeks),
        adherenceStatus: calculateAdherenceStatus(lastFourWeeksAdherence),
        intensityLevel: calculateIntensityFromHR(hrZoneSummary && {
          zone1Hours: parseFloat(String(hrZoneSummary.total_zone_1 || 0)) / 3600,
          zone2Hours: parseFloat(String(hrZoneSummary.total_zone_2 || 0)) / 3600,
          zone3Hours: parseFloat(String(hrZoneSummary.total_zone_3 || 0)) / 3600,
          zone4Hours: parseFloat(String(hrZoneSummary.total_zone_4 || 0)) / 3600,
          zone5Hours: parseFloat(String(hrZoneSummary.total_zone_5 || 0)) / 3600,
          totalHours: (
            parseFloat(String(hrZoneSummary.total_zone_1 || 0)) +
            parseFloat(String(hrZoneSummary.total_zone_2 || 0)) +
            parseFloat(String(hrZoneSummary.total_zone_3 || 0)) +
            parseFloat(String(hrZoneSummary.total_zone_4 || 0)) +
            parseFloat(String(hrZoneSummary.total_zone_5 || 0))
          ) / 3600,
        }),
      },
      keyContext: {
        raceDateProximity: calculateDaysRemaining(activeGoal?.target_date),
        trainingPhase: determineTrainingPhase(activePlan, activeGoal),
        recentConcerns: null, // Now covered by dailyInsights risk indicators
      },
    },

    // Long-Term Memory (Phase 2: RAG-based semantic memory)
    longTermMemory: userQuery ? await retrieveRelevantMemories(userId, userQuery, 5) : undefined,

    // NEW: Pre-computed insights for specific coaching feedback
    dailyInsights,
    weeklyInsight,

    // NEW Phase 2: Behavioral patterns for historical coaching
    runnerTendencies,

    // Race history and personal bests for context
    raceHistory,
    personalBests,
  };

  // Log the context being sent to the agent for debugging
  console.log('\n========== CONTEXT BUILDER: USER CONTEXT FOR AGENT ==========');
  console.log('User ID:', userId);
  console.log('User Name:', contextData.firstName);
  console.log('Query:', userQuery || 'N/A');
  console.log('\n--- FULL CONTEXT PAYLOAD ---');
  console.log(JSON.stringify(contextData, null, 2));
  console.log('========== END CONTEXT PAYLOAD ==========\n');

  return contextData;
}

/**
 * Helper functions for session summary (medium-term memory)
 */

function calculateCurrentWeek(planStartDate?: Date): number {
  if (!planStartDate) return 0;
  const start = new Date(planStartDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  return diffWeeks;
}

function calculateMileageTrend(weeksData: number[]): string {
  if (!weeksData || weeksData.length < 2) return 'stable';
  const recent = weeksData[weeksData.length - 1];
  const previous = weeksData[weeksData.length - 2];
  if (recent > previous * 1.1) return 'increasing (+10%+ from last week)';
  if (recent < previous * 0.9) return 'decreasing (>10% from last week)';
  return 'stable';
}

function calculateAdherenceStatus(adherenceData: any): string {
  if (!adherenceData) return 'unknown';
  const rate = adherenceData.adherenceRate || 0;
  if (rate >= 90) return 'excellent (90%+)';
  if (rate >= 75) return 'good (75-90%)';
  if (rate >= 60) return 'moderate (60-75%)';
  return 'concerning (<60%)';
}

function calculateIntensityFromHR(hrData: any): string {
  if (!hrData || hrData.totalHours === 0) return 'unknown';
  const zone4_5_hours = hrData.zone4Hours + hrData.zone5Hours;
  const zone4_5_percent = (zone4_5_hours / hrData.totalHours) * 100;
  if (zone4_5_percent > 25) return 'high (25%+ in zones 4-5)';
  if (zone4_5_percent > 15) return 'moderate (15-25% in zones 4-5)';
  return 'low (mostly easy paced)';
}

function determineTrainingPhase(plan: any, goal: any): string {
  if (!plan || !goal) return 'unstructured training';
  const daysUntilRace = calculateDaysRemaining(goal.target_date);
  if (daysUntilRace < 14) return 'taper';
  if (daysUntilRace < 28) return 'peak';
  if (daysUntilRace < 56) return 'build';
  return 'base building';
}

function extractRecentConcerns(activities: any[]): string | null {
  if (!activities || activities.length === 0) return null;
  const recentActivity = activities[0];
  if (recentActivity.perceived_exertion && recentActivity.perceived_exertion >= 8) {
    return 'High perceived exertion in recent runs';
  }
  return null;
}

function calculateDaysRemaining(targetDate?: Date): number {
  if (!targetDate) return 0;
  const target = new Date(targetDate);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function formatTime(seconds?: number): string {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString();
}

function formatPace(pace: number): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fetch daily insights for the last N days
 */
export async function getDailyInsights(userId: number, days: number = 7): Promise<DailyRunInsight[]> {
  try {
    const result = await pool.query(
      `SELECT
        di.*,
        a.distance_meters,
        a.moving_time_seconds,
        a.average_speed,
        a.name as activity_name
       FROM daily_run_insights di
       JOIN activities a ON a.id = di.activity_id
       WHERE di.user_id = $1
       ORDER BY di.run_date DESC
       LIMIT $2`,
      [userId, days]
    );

    return result.rows.map(row => ({
      activityId: row.activity_id,
      userId: row.user_id,
      runDate: row.run_date,
      // Add basic activity fields
      distance_meters: row.distance_meters,
      moving_time_seconds: row.moving_time_seconds,
      average_pace: row.average_speed ? (1000 / row.average_speed / 60) : null, // Convert m/s to min/km
      activity_name: row.activity_name,
      // Analysis fields
      pacing: row.pacing_analysis,
      hrBehavior: row.hr_behavior,
      effort: row.effort_analysis,
      compliance: row.compliance_check,
      risks: row.risk_indicators,
      coachingPoints: row.coaching_points
    }));
  } catch (error) {
    console.warn('Failed to fetch daily insights:', error);
    return [];
  }
}

/**
 * Fetch the latest weekly insight
 */
export async function getLatestWeeklyInsight(userId: number): Promise<WeeklyInsight | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM weekly_insights
       WHERE user_id = $1
       ORDER BY week_start DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      userId: row.user_id,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      volume: row.volume_analysis,
      adherence: row.adherence_tracking,
      patterns: row.pattern_changes,
      trainingLoad: row.training_load,
      weeklyRisks: row.weekly_risks,
      nextWeekGuidance: row.next_week_guidance
    };
  } catch (error) {
    console.warn('Failed to fetch weekly insight:', error);
    return null;
  }
}

/**
 * Fetch runner tendencies (behavioral patterns)
 */
async function getRunnerTendencies(userId: number): Promise<RunnerTendency[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM runner_tendencies
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      tendencyType: row.tendency_type,
      pacingBehavior: row.pacing_behavior,
      hrManagement: row.hr_management,
      volumeBehavior: row.volume_behavior,
      complianceBehavior: row.compliance_behavior,
      observationStart: row.observation_start,
      observationEnd: row.observation_end,
      activitiesAnalyzed: row.activities_analyzed,
      confidenceScore: parseFloat(row.confidence_score || '0')
    }));
  } catch (error) {
    console.warn('Failed to fetch runner tendencies:', error);
    return [];
  }
}

/**
 * Compute Marathon Performance Metrics
 * RAW DATA ONLY - No pre-labeled judgments.
 * Backend = Calculator, LLM = Analyst
 * Let the LLM reason and make judgment calls.
 */
export function computeMarathonMetrics(
  activeGoal: any,
  profile: any,
  thisWeekWorkouts: any[],
  thisWeekActivities: any[],
  hrZoneDistribution: any,
  recentActivities: any[]
): MarathonMetrics {
  // === GOAL METRICS (Factual) ===
  let goal: MarathonMetrics['goal'] = null;
  let paceTargets: MarathonMetrics['paceTargets'] = null;

  if (activeGoal?.target_time_seconds && activeGoal?.goal_type) {
    const raceDistances: Record<string, number> = {
      'marathon': 42.195,
      'half_marathon': 21.0975,
      '10k': 10,
      '5k': 5,
    };

    const raceDistanceKm = raceDistances[activeGoal.goal_type] || 42.195;
    const targetTimeSeconds = activeGoal.target_time_seconds;
    const goalPaceMinKm = (targetTimeSeconds / 60) / raceDistanceKm;

    const daysUntilRace = activeGoal.target_date
      ? Math.ceil((new Date(activeGoal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    goal = {
      targetTimeSeconds,
      goalPaceMinKm,
      goalPaceFormatted: formatPaceValue(goalPaceMinKm),
      raceDate: activeGoal.target_date
        ? new Date(activeGoal.target_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'Not set',
      daysUntilRace: Math.max(0, daysUntilRace),
      raceDistanceKm,
    };

    // Pace targets are reference points, not judgments
    paceTargets = {
      easy: {
        min: formatPaceValue(goalPaceMinKm + 1.0),
        max: formatPaceValue(goalPaceMinKm + 1.5),
      },
      tempo: {
        min: formatPaceValue(goalPaceMinKm - 0.25),
        max: formatPaceValue(goalPaceMinKm + 0.25),
      },
      interval: {
        min: formatPaceValue(goalPaceMinKm - 0.67),
        max: formatPaceValue(goalPaceMinKm - 0.33),
      },
      longRun: {
        min: formatPaceValue(goalPaceMinKm + 0.5),
        max: formatPaceValue(goalPaceMinKm + 1.0),
      },
    };
  }

  // === WEEKLY LOAD - RAW NUMBERS ONLY ===
  // Calculate actual average weekly volume from last 4 weeks of activities
  // Note: fourWeeksAgo is already defined at the top of buildUserContext
  const fourWeeksAgoDate = new Date();
  fourWeeksAgoDate.setDate(fourWeeksAgoDate.getDate() - 28);

  const actualAvgWeeklyKm = recentActivities.length > 0
    ? recentActivities
        .filter(a => new Date(a.start_date) >= fourWeeksAgoDate)
        .reduce((sum, a) => sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0) / 4
    : 0;

  // Use actual data if available, otherwise fall back to profile's self-reported value
  const typicalWeeklyKm = actualAvgWeeklyKm > 0
    ? Math.round(actualAvgWeeklyKm * 10) / 10
    : (profile?.typical_weekly_mileage || 0);

  const plannedDistanceKm = thisWeekWorkouts.reduce((sum, w) =>
    sum + (w.target_distance_meters ? parseFloat(String(w.target_distance_meters)) / 1000 : 0), 0
  );
  const completedDistanceKm = thisWeekActivities.reduce((sum, a) =>
    sum + (a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0), 0
  );
  const volumeChangePercent = typicalWeeklyKm > 0
    ? ((plannedDistanceKm - typicalWeeklyKm) / typicalWeeklyKm) * 100
    : 0;

  const weeklyLoad: MarathonMetrics['weeklyLoad'] = {
    plannedDistanceKm: Math.round(plannedDistanceKm * 10) / 10,
    typicalWeeklyKm,
    volumeChangePercent: Math.round(volumeChangePercent * 10) / 10,
    completedDistanceKm: Math.round(completedDistanceKm * 10) / 10,
    remainingDistanceKm: Math.round((plannedDistanceKm - completedDistanceKm) * 10) / 10,
  };

  // === STRESS DISTRIBUTION - QUALITY KM BREAKDOWN ===
  // Let LLM infer stress density from actual km, not session labels
  let tempoKm = 0;
  let intervalKm = 0;
  let longRunKm = 0;
  let easyKm = 0;

  const workoutBreakdown: Array<{
    workoutId: number | null;
    day: string;
    type: string;
    distanceKm: number;
    isQuality: boolean;
  }> = [];

  thisWeekWorkouts.forEach(w => {
    const distanceKm = w.target_distance_meters
      ? parseFloat(String(w.target_distance_meters)) / 1000
      : 0;
    const type = (w.workout_type || '').toLowerCase();
    const name = (w.name || '').toLowerCase();
    const date = new Date(w.scheduled_date);
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });

    let isQuality = false;

    if (type.includes('tempo') || type.includes('threshold') || name.includes('tempo')) {
      tempoKm += distanceKm;
      isQuality = true;
    } else if (type.includes('interval') || type.includes('speed') || name.includes('interval')) {
      intervalKm += distanceKm;
      isQuality = true;
    } else if (type.includes('long') || name.includes('long')) {
      longRunKm += distanceKm;
      isQuality = true;
    } else {
      easyKm += distanceKm;
    }

    // Include workoutId for pending workouts (tool calls need this)
    // Completed workouts have null ID since they can't be modified
    const isCompleted = w.completion_status === 'completed';

    workoutBreakdown.push({
      workoutId: isCompleted ? null : w.id,
      day,
      type: w.workout_type || 'unknown',
      distanceKm: Math.round(distanceKm * 10) / 10,
      isQuality,
    });
  });

  const totalQualityKm = tempoKm + intervalKm + longRunKm;
  const qualityKmPercent = plannedDistanceKm > 0
    ? (totalQualityKm / plannedDistanceKm) * 100
    : 0;

  const stressDistribution: MarathonMetrics['stressDistribution'] = {
    tempoKm: Math.round(tempoKm * 10) / 10,
    intervalKm: Math.round(intervalKm * 10) / 10,
    longRunKm: Math.round(longRunKm * 10) / 10,
    easyKm: Math.round(easyKm * 10) / 10,
    qualityKmPercent: Math.round(qualityKmPercent * 10) / 10,
    workoutBreakdown,
  };

  // === LONG RUN DATA - RAW NUMBERS, NO PROGRESSION LABELS ===
  const longRunWorkout = thisWeekWorkouts.find(w =>
    (w.workout_type || '').toLowerCase().includes('long') ||
    (w.name || '').toLowerCase().includes('long')
  );
  const thisWeekLongRunKm = longRunWorkout?.target_distance_meters
    ? parseFloat(String(longRunWorkout.target_distance_meters)) / 1000
    : null;

  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  // Get weekly long runs for last 4 weeks - LLM sees the pattern
  const activitiesByWeek: number[][] = [[], [], [], []];
  recentActivities.forEach(a => {
    const activityDate = new Date(a.start_date);
    if (activityDate >= fourWeeksAgo) {
      const weeksAgo = Math.floor((Date.now() - activityDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksAgo >= 0 && weeksAgo < 4) {
        const distance = a.distance_meters ? parseFloat(String(a.distance_meters)) / 1000 : 0;
        activitiesByWeek[weeksAgo].push(distance);
      }
    }
  });

  // Get longest run from each week
  const weeklyLongRuns4Weeks = activitiesByWeek.map(week =>
    week.length > 0 ? Math.round(Math.max(...week) * 10) / 10 : 0
  ).reverse(); // [oldest, ..., newest]

  const longestRunLast4Weeks = Math.max(...weeklyLongRuns4Weeks, 0);

  const raceDistanceKm = goal?.raceDistanceKm || 42.195;
  const longRunAsPercentOfRace = thisWeekLongRunKm
    ? (thisWeekLongRunKm / raceDistanceKm) * 100
    : null;

  const longRunData: MarathonMetrics['longRunData'] = {
    thisWeekLongRunKm: thisWeekLongRunKm ? Math.round(thisWeekLongRunKm * 10) / 10 : null,
    longRunAsPercentOfRace: longRunAsPercentOfRace ? Math.round(longRunAsPercentOfRace * 10) / 10 : null,
    longestRunLast4Weeks: Math.round(longestRunLast4Weeks * 10) / 10,
    weeklyLongRuns4Weeks,
  };

  // === TRAINING CONTEXT - FACTUAL ONLY ===
  const weeksUntilRace = goal?.daysUntilRace ? Math.ceil(goal.daysUntilRace / 7) : 0;

  let trainingPhase: 'base' | 'build' | 'peak' | 'taper' = 'base';
  if (weeksUntilRace > 0) {
    if (weeksUntilRace <= 2) trainingPhase = 'taper';
    else if (weeksUntilRace <= 4) trainingPhase = 'peak';
    else if (weeksUntilRace <= 8) trainingPhase = 'build';
    else trainingPhase = 'base';
  }

  const trainingContext: MarathonMetrics['trainingContext'] = {
    weeksUntilRace,
    trainingPhase,
  };

  // === AEROBIC DATA - RAW PERCENTAGES, NO JUDGMENT ===
  let aerobicData: MarathonMetrics['aerobicData'] = {
    zone1_2Percent: 0,
    zone4_5Percent: 0,
    totalTrainingHours: 0,
  };

  if (hrZoneDistribution && hrZoneDistribution.totalHours > 0) {
    const zone1_2Hours = (hrZoneDistribution.zone1Hours || 0) + (hrZoneDistribution.zone2Hours || 0);
    const zone4_5Hours = (hrZoneDistribution.zone4Hours || 0) + (hrZoneDistribution.zone5Hours || 0);

    aerobicData = {
      zone1_2Percent: Math.round((zone1_2Hours / hrZoneDistribution.totalHours) * 100),
      zone4_5Percent: Math.round((zone4_5Hours / hrZoneDistribution.totalHours) * 100),
      totalTrainingHours: Math.round(hrZoneDistribution.totalHours * 10) / 10,
    };
  }

  // === RECENT PERFORMANCE - RAW INDICATORS ===
  // Note: actualAvgWeeklyKm was already calculated above for typicalWeeklyKm

  const easyRuns = thisWeekActivities.filter(a =>
    a.average_heartrate && parseFloat(String(a.average_heartrate)) < (profile?.hr_zone_3_max || 160)
  );

  const avgEasyPaceMinKm = easyRuns.length > 0
    ? easyRuns.reduce((sum, a) =>
      sum + (a.average_speed ? 1000 / (parseFloat(String(a.average_speed)) * 60) : 0), 0
    ) / easyRuns.length
    : null;

  const avgEasyHR = easyRuns.length > 0
    ? Math.round(easyRuns.reduce((sum, a) =>
      sum + parseFloat(String(a.average_heartrate)), 0
    ) / easyRuns.length)
    : null;

  const recentPerformance: MarathonMetrics['recentPerformance'] = {
    avgEasyPaceMinKm: avgEasyPaceMinKm ? Math.round(avgEasyPaceMinKm * 100) / 100 : null,
    avgEasyPaceFormatted: avgEasyPaceMinKm ? formatPaceValue(avgEasyPaceMinKm) : null,
    avgEasyHR,
    avgWeeklyVolume4Weeks: Math.round(actualAvgWeeklyKm * 10) / 10,
  };

  return {
    goal,
    paceTargets,
    weeklyLoad,
    stressDistribution,
    longRunData,
    trainingContext,
    aerobicData,
    recentPerformance,
  };
}

/**
 * Format pace value (decimal min/km) to MM:SS string
 */
function formatPaceValue(pace: number): string {
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

export function buildSystemPrompt(userData: UserContextData): string {
  const zone1_2_percent = userData.hrZoneDistribution
    ? ((userData.hrZoneDistribution.zone1Hours + userData.hrZoneDistribution.zone2Hours) /
      userData.hrZoneDistribution.totalHours) * 100
    : 0;

  return `You are an expert running coach assistant helping ${userData.firstName}.

# ⚠️ CRITICAL: DATA ACCURACY REQUIREMENTS

**ABSOLUTELY REQUIRED:**
1. **ONLY use data explicitly provided in this context** - Never make up workout details, dates, or schedules
2. **If information is not in the context, say "I don't have that information"** - Don't guess or infer
3. **For workout schedules, ONLY reference workouts listed in "Next 7 Days Detailed Schedule"** - These are the EXACT workouts from the database
4. **Never hallucinate workout details** - If a workout doesn't have pace/distance/HR zone listed, don't add it
5. **Dates must match exactly** - Don't shift or adjust dates unless explicitly using the tools provided
6. **When describing future workouts, copy the details VERBATIM** from the schedule below

**Examples of what NOT to do:**
❌ "Your long run on Sunday is 20km" (when the schedule shows 18km)
❌ "You have threshold intervals tomorrow" (when tomorrow shows an easy run)
❌ Adding pace targets that aren't in the workout description
❌ Assuming rest days that aren't explicitly scheduled

**What TO do:**
✅ "According to your schedule, [exact date] shows: [exact workout name] - [exact distance] [exact pace if provided]"
✅ "I can see you have [X] workouts in the next 7 days based on your plan"
✅ "Your schedule doesn't show a workout for that date"

# Athlete Profile
${userData.profile.age ? `- Age: ${userData.profile.age}` : ''}
${userData.profile.weight_kg ? `- Weight: ${userData.profile.weight_kg} kg` : ''}
${userData.profile.running_experience_years ? `- Running Experience: ${userData.profile.running_experience_years} years` : ''}
${userData.profile.typical_weekly_mileage ? `- Typical Weekly Mileage: ${userData.profile.typical_weekly_mileage} km` : ''}
${userData.profile.injury_history ? `- Injury History: ${userData.profile.injury_history}` : '- Injury History: None reported'}

# Current Goal
${userData.activeGoal ? `- Goal: ${userData.activeGoal.goal_type}
- Target Time: ${formatTime(userData.activeGoal.target_time_seconds)}
- Target Date: ${formatDate(userData.activeGoal.target_date)}
- Days Remaining: ${calculateDaysRemaining(userData.activeGoal.target_date)}
${userData.activeGoal.race_name ? `- Race: ${userData.activeGoal.race_name}` : ''}` : '- No active goal set'}

${userData.activePlan ? `# Active Training Plan
- Plan: ${userData.activePlan.name}
- Duration: ${userData.activePlan.totalWeeks || 'N/A'} weeks
- Progress: Week ${calculateCurrentWeek(userData.activePlan.startDate)} of ${userData.activePlan.totalWeeks || 'N/A'}
- Start Date: ${formatDate(userData.activePlan.startDate)}
- End Date: ${formatDate(userData.activePlan.endDate)}` : '# Active Training Plan\n- No active training plan'}

${userData.thisWeekPlan ? `# This Week's Plan
- Total Planned Distance: ${userData.thisWeekPlan.totalPlannedDistance.toFixed(1)} km
- Completed So Far: ${userData.thisWeekPlan.completedDistance.toFixed(1)} km
- Remaining: ${(userData.thisWeekPlan.totalPlannedDistance - userData.thisWeekPlan.completedDistance).toFixed(1)} km

Planned Workouts:
${userData.thisWeekPlan.workouts.map(w =>
    `- ${formatDate(w.date)}: ${w.name || w.type} ${w.distance ? `- ${w.distance.toFixed(1)}km` : ''} ${w.hrZone ? `(Zone ${w.hrZone})` : ''} ${w.description ? `\n  Note: ${w.description}` : ''}`
  ).join('\n')}` : '# This Week\'s Plan\n- No workouts planned for this week'}

${userData.nextFourWeeksPlan ? `# Upcoming Training Load (Next 4 Weeks)
- Week 1: ${userData.nextFourWeeksPlan.week1Distance.toFixed(1)} km
- Week 2: ${userData.nextFourWeeksPlan.week2Distance.toFixed(1)} km
- Week 3: ${userData.nextFourWeeksPlan.week3Distance.toFixed(1)} km
- Week 4: ${userData.nextFourWeeksPlan.week4Distance.toFixed(1)} km` : ''}

${userData.upcomingWorkouts && userData.upcomingWorkouts.length > 0 ? `# Next 7 Days Detailed Schedule (EXACT DATA - DO NOT MODIFY)
${userData.upcomingWorkouts.map(w =>
    `- ${formatDate(w.date)}: ${w.name || w.type}${w.targetDistance ? ` - ${w.targetDistance.toFixed(1)}km` : ''}${w.targetPace ? ` at ${w.targetPace}` : ''}${w.hrZone ? ` (Zone ${w.hrZone})` : ''}${w.description ? `\n  Details: ${w.description}` : ''}`
  ).join('\n')}

⚠️ This is the COMPLETE list of workouts for the next 7 days. If a date is missing, there is NO workout scheduled for that day.` : '# Next 7 Days Detailed Schedule\n⚠️ No workouts currently scheduled for the next 7 days.'}

# Recent Training Summary (Last 30 Days)
- Total Runs: ${userData.recentStats.totalRuns}
- Total Distance: ${userData.recentStats.totalDistance.toFixed(2)} km
- Average Pace: ${formatPace(userData.recentStats.averagePace)} min/km
- Total Elevation: ${userData.recentStats.totalElevation.toFixed(0)} m
- Longest Run: ${userData.recentStats.longestRun.toFixed(2)} km

${userData.lastWeekAdherence ? `# Training Plan Adherence (Last 7 Days)
- Planned Workouts: ${userData.lastWeekAdherence.planned}
- Completed: ${userData.lastWeekAdherence.completed}
- Skipped: ${userData.lastWeekAdherence.skipped}
- Adherence Rate: ${userData.lastWeekAdherence.planned > 0 ? Math.round((userData.lastWeekAdherence.completed / userData.lastWeekAdherence.planned) * 100) : 0}%` : ''}

${userData.lastFourWeeksAdherence ? `# Last 4 Weeks Training Summary
- Planned Distance: ${userData.lastFourWeeksAdherence.plannedDistance.toFixed(1)} km
- Actual Distance: ${userData.lastFourWeeksAdherence.actualDistance.toFixed(1)} km
- Adherence: ${userData.lastFourWeeksAdherence.adherenceRate.toFixed(0)}%
${userData.lastFourWeeksAdherence.adherenceRate < 80 ? '⚠️ Below target - consistency is key for marathon training' : '✓ Good adherence to plan'}` : ''}

${userData.goalProgress ? `# Goal Progress Analysis
- Weeks Until Race: ${userData.goalProgress.weeksRemaining}
- Target Weekly Mileage: ${userData.goalProgress.avgWeeklyMileageNeeded.toFixed(1)} km
- Current Weekly Average: ${userData.goalProgress.currentAvgWeeklyMileage.toFixed(1)} km
- Status: ${userData.goalProgress.onTrack ? '✓ ON TRACK - Keep up the great work!' : '⚠️ BELOW TARGET - Need to increase weekly mileage'}
${!userData.goalProgress.onTrack ? `- Gap: ${(userData.goalProgress.avgWeeklyMileageNeeded - userData.goalProgress.currentAvgWeeklyMileage).toFixed(1)} km per week` : ''}` : ''}

${userData.hrZoneDistribution ? `# Heart Rate Zone Distribution (Last 30 Days)
- Zone 1 (Recovery, <120 bpm): ${userData.hrZoneDistribution.zone1Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone1Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 2 (Easy, 120-140 bpm): ${userData.hrZoneDistribution.zone2Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone2Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 3 (Moderate, 140-160 bpm): ${userData.hrZoneDistribution.zone3Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone3Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 4 (Hard, 160-175 bpm): ${userData.hrZoneDistribution.zone4Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone4Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Zone 5 (Max, >175 bpm): ${userData.hrZoneDistribution.zone5Hours.toFixed(1)}h (${(userData.hrZoneDistribution.zone5Hours / userData.hrZoneDistribution.totalHours * 100).toFixed(0)}%)
- Total Training Time: ${userData.hrZoneDistribution.totalHours.toFixed(1)}h

IMPORTANT: For marathon training, ~80% of volume should be in Zones 1-2. Current: ${zone1_2_percent.toFixed(0)}%` : '# Heart Rate Zone Distribution\n- HR zone data not available yet'}

# Recent Runs (Last 30 Days)
${userData.recentActivities && userData.recentActivities.length > 0
  ? userData.recentActivities.slice(0, 10).map(activity => `- ${formatDate(activity.start_date)}: ${(activity.distance_meters / 1000).toFixed(2)} km in ${formatTime(activity.moving_time_seconds)} (${(activity.average_speed ? (1000 / (activity.average_speed * 60)).toFixed(2) : 'N/A')} min/km pace)`).join('\n')
  : '- No activities recorded in the last 30 days. Sync activities from Strava to begin analysis.'}

# Your Role as AI Running Coach
You are an expert running coach who provides:

**Training Plan Analysis:**
- Analyze this week's planned workouts in context of the overall goal
- Identify if the training load is appropriate or needs adjustment
- Flag potential issues (too much intensity, insufficient recovery, mileage jumps)
- Consider the next 4 weeks of planned training when giving advice

**Post-Run Feedback & Check-ins:**
- When the athlete completes a run, compare it to what was planned
- Provide specific feedback on pace, HR zones, and execution
- Celebrate wins and identify areas for improvement
- Suggest adjustments to upcoming workouts based on recent performance

**Goal Progress Monitoring:**
- Regularly assess if training is on track for the goal
- Calculate if weekly mileage aligns with goal requirements
- Provide specific recommendations when behind or ahead of target
- Consider time remaining and adjust advice accordingly

**Proactive Coaching:**
- Suggest modifications to planned workouts when needed
- Warn about injury risks (sudden mileage increases, too much intensity)
- Recommend recovery when HR data shows high zone training
- Encourage consistency when adherence drops

# Guidelines
- **DATA ACCURACY IS PARAMOUNT:** Never deviate from the provided schedule data
- **Be Specific:** Reference actual workout names, dates, and metrics FROM THE SCHEDULE ABOVE
- **Compare Plan vs Actual:** "Your Tuesday tempo run was planned for 10km at 4:45/km, but you ran 4:38/km - excellent pacing!"
- **Look Forward:** Only reference workouts explicitly listed in "Next 7 Days Detailed Schedule"
- **Context Aware:** Consider goal date, injury history, HR zones, adherence rate
- **Actionable Advice:** Don't just analyze - suggest concrete adjustments using available tools
- **Supportive but Honest:** Celebrate successes, but flag concerns directly
- **Use Metric Units:** km, kg, min/km, bpm
- **HR Zone Specific:** Zone 1 (<120), Zone 2 (120-140), Zone 3 (140-160), Zone 4 (160-175), Zone 5 (>175)
- **When asked about schedule:** Copy the workout details EXACTLY as shown in "Next 7 Days Detailed Schedule"

# Example Interactions
**Check-in after a run:** "Great job completing yesterday's easy 8km! I see you kept it in Zone 2 (avg 135 bpm) as planned. Your Wednesday tempo run is coming up - 12km with 6km at threshold pace. Ready to discuss pacing strategy?"

**Weekly analysis:** "Looking at your week: You've completed 35km of 45km planned. Your long run Sunday is crucial - 20km in Zone 2. This is a key workout for your marathon goal, don't skip it!"

**Goal progress:** "You're ${userData.goalProgress?.weeksRemaining} weeks from race day. Your current weekly average (${userData.goalProgress?.currentAvgWeeklyMileage.toFixed(1)}km) is ${userData.goalProgress?.onTrack ? 'right on track!' : `below the target ${userData.goalProgress?.avgWeeklyMileageNeeded.toFixed(1)}km needed for sub-3hr marathon. Let's discuss how to safely build up.`}"

# ⚠️ CRITICAL REMINDERS
- **NEVER make up workout details** - Only use what's in "Next 7 Days Detailed Schedule"
- **NEVER adjust dates or distances** without being asked and using tools
- **NEVER add information that isn't in the context** (e.g., don't add pace targets if not specified)
- Refer to THIS WEEK'S PLAN and NEXT 4 WEEKS when giving advice
- Use Goal Progress data to keep athlete motivated and on track
- Flag adherence issues proactively
- Suggest workout modifications when HR data shows overtraining
- **When describing the schedule, be LITERAL and EXACT** - copy from "Next 7 Days Detailed Schedule"`;
}
