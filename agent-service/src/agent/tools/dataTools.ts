/**
 * JIT Data Fetching Tools
 *
 * Tools that allow workers to fetch specific data on-demand
 * rather than loading everything upfront.
 *
 * Each tool fetches minimal data needed for its purpose:
 * - get_user_profile: ~500 tokens
 * - get_upcoming_workouts: ~500 tokens for 7 days
 * - get_last_activity: ~500 tokens
 * - get_recent_activities: ~300 tokens per activity
 * - get_this_week_adherence: ~300 tokens
 * - get_hr_zone_summary: ~400 tokens
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { backendClient } from '../../api/backendClient';

// ============================================
// SCHEMAS (defined separately to avoid TS2589)
// ============================================

const userIdSchema = z.object({
  userId: z.number().describe('The user ID'),
});

const upcomingWorkoutsSchema = z.object({
  userId: z.number().describe('The user ID'),
  days: z.number().min(1).max(28).default(7).describe('Number of days to look ahead (1-28)'),
});

const recentActivitiesSchema = z.object({
  userId: z.number().describe('The user ID'),
  days: z.number().min(1).max(30).default(7).describe('Number of days to look back (1-30)'),
});

const hrZoneSummarySchema = z.object({
  userId: z.number().describe('The user ID'),
  days: z.number().min(7).max(90).default(30).describe('Number of days to analyze (7-90)'),
});

const historicalSummariesSchema = z.object({
  userId: z.number().describe('The user ID'),
  weeks: z.number().min(2).max(12).default(4).describe('Number of weeks to look back (2-12)'),
});

// ============================================
// CORE CONTEXT TOOLS (~500 tokens each)
// ============================================

/**
 * Get basic user profile and goal information
 */
export const getUserProfileTool = (tool as any)(
  async ({ userId }: { userId: number }) => {
    console.log(`📦 JIT Tool: get_user_profile for user ${userId}`);

    const context = await backendClient.getCoreContext(userId);

    return JSON.stringify({
      firstName: context.firstName,
      goalType: context.goalType,
      goalDate: context.goalDate,
      goalPace: context.goalPace,
      trainingPhase: context.trainingPhase,
      weeksRemaining: context.weeksRemaining,
      coachStyle: context.coachStyle,
      experienceYears: context.experienceYears,
    });
  },
  {
    name: 'get_user_profile',
    description: "Get basic user profile and goal information. Use when you need to know the athlete's goal, target pace, or training phase. Returns ~500 tokens.",
    schema: userIdSchema,
  } as any
);

// ============================================
// ACTIVE CONTEXT TOOLS (~500-3000 tokens)
// ============================================

/**
 * Get upcoming planned workouts for N days
 */
export const getUpcomingWorkoutsTool = (tool as any)(
  async ({ userId, days }: { userId: number; days: number }) => {
    console.log(`📦 JIT Tool: get_upcoming_workouts for user ${userId}, ${days} days`);

    const workouts = await backendClient.getUpcomingWorkouts(userId, days);

    return JSON.stringify(
      workouts.map((w: any) => ({
        id: w.id,
        date: w.scheduledDate,
        type: w.workoutType,
        name: w.name,
        distanceKm: w.targetDistanceMeters ? w.targetDistanceMeters / 1000 : null,
        targetPace: w.targetPaceAvg,
        hrZone: w.targetHrZone,
        status: w.completionStatus,
      }))
    );
  },
  {
    name: 'get_upcoming_workouts',
    description: 'Get upcoming planned workouts for the next N days. Use when reviewing or modifying the training plan. Returns ~500 tokens for 7 days.',
    schema: upcomingWorkoutsSchema,
  } as any
);

/**
 * Get the most recent completed activity
 */
export const getLastActivityTool = (tool as any)(
  async ({ userId }: { userId: number }) => {
    console.log(`📦 JIT Tool: get_last_activity for user ${userId}`);

    const activity = await backendClient.getLastActivity(userId);

    if (!activity) {
      return JSON.stringify({ error: 'No recent activity found' });
    }

    return JSON.stringify({
      id: activity.id,
      date: activity.startDate,
      name: activity.name,
      distanceKm: activity.distanceMeters / 1000,
      durationMin: activity.movingTimeSeconds / 60,
      avgPace: activity.averagePace,
      avgHR: activity.averageHeartrate,
      maxHR: activity.maxHeartrate,
    });
  },
  {
    name: 'get_last_activity',
    description: 'Get the most recent completed activity with full details. Use when analyzing a specific recent run. Returns ~500 tokens.',
    schema: userIdSchema,
  } as any
);

/**
 * Get recent activities for N days
 */
export const getRecentActivitiesTool = (tool as any)(
  async ({ userId, days }: { userId: number; days: number }) => {
    console.log(`📦 JIT Tool: get_recent_activities for user ${userId}, ${days} days`);

    const activities = await backendClient.getRecentActivities(userId, days);

    return JSON.stringify(
      activities.map((a: any) => ({
        id: a.id,
        date: a.startDate,
        name: a.name,
        distanceKm: a.distanceMeters / 1000,
        avgPace: a.averagePace,
        avgHR: a.averageHeartrate,
      }))
    );
  },
  {
    name: 'get_recent_activities',
    description: 'Get recent completed activities for the past N days. Use for analyzing training patterns or volume. Returns ~300 tokens per activity.',
    schema: recentActivitiesSchema,
  } as any
);

/**
 * Get this week's training plan adherence
 */
export const getThisWeekAdherenceTool = (tool as any)(
  async ({ userId }: { userId: number }) => {
    console.log(`📦 JIT Tool: get_this_week_adherence for user ${userId}`);

    const activeContext = await backendClient.getActiveContext(userId);

    return JSON.stringify({
      plannedWorkouts: activeContext.currentAdherence.planned,
      completedWorkouts: activeContext.currentAdherence.completed,
      adherenceRate: activeContext.currentAdherence.adherenceRate,
      plannedDistanceKm: activeContext.currentAdherence.plannedDistanceKm,
      actualDistanceKm: activeContext.currentAdherence.actualDistanceKm,
      thisWeekStats: activeContext.thisWeekStats,
    });
  },
  {
    name: 'get_this_week_adherence',
    description: 'Get training plan adherence for the current week. Use when discussing progress or weekly review. Returns ~300 tokens.',
    schema: userIdSchema,
  } as any
);

/**
 * Get HR zone distribution summary
 */
export const getHRZoneSummaryTool = (tool as any)(
  async ({ userId, days }: { userId: number; days: number }) => {
    console.log(`📦 JIT Tool: get_hr_zone_summary for user ${userId}, ${days} days`);

    const hrZones = await backendClient.getHRZoneSummary(userId, days);

    if (!hrZones) {
      return JSON.stringify({ error: 'No HR zone data available' });
    }

    return JSON.stringify({
      zone1Percent: hrZones.zone1Percent,
      zone2Percent: hrZones.zone2Percent,
      zone3Percent: hrZones.zone3Percent,
      zone4Percent: hrZones.zone4Percent,
      zone5Percent: hrZones.zone5Percent,
      totalHours: hrZones.totalHours,
      aerobicPercent: hrZones.aerobicPercent,
      period: `${days} days`,
    });
  },
  {
    name: 'get_hr_zone_summary',
    description: 'Get heart rate zone distribution for the past N days. Use when analyzing training intensity balance. Returns ~400 tokens.',
    schema: hrZoneSummarySchema,
  } as any
);

// ============================================
// DEEP CONTEXT TOOLS (~1000-5000 tokens)
// ============================================

/**
 * Get historical training summaries by week
 */
export const getHistoricalSummariesTool = (tool as any)(
  async ({ userId, weeks }: { userId: number; weeks: number }) => {
    console.log(`📦 JIT Tool: get_historical_summaries for user ${userId}, ${weeks} weeks`);

    const deepContext = await backendClient.getDeepContext(userId);

    // Return weekly insights limited to requested weeks
    const summaries = deepContext.weeklyInsights.slice(0, weeks);

    return JSON.stringify({
      weeklySummaries: summaries,
      longRunProgression: deepContext.longRunProgression,
      planAdherenceLast4Weeks: deepContext.planAdherenceLast4Weeks,
    });
  },
  {
    name: 'get_historical_summaries',
    description: 'Get weekly training summaries for historical analysis. Use for long-term progress review. Returns ~500 tokens per week.',
    schema: historicalSummariesSchema,
  } as any
);

// ============================================
// TOOL GROUPS BY WORKER TYPE
// ============================================

/**
 * Tools for the Historian worker (memory/RAG agent)
 */
export const historianTools = [
  getUserProfileTool,
  getHistoricalSummariesTool,
  getHRZoneSummaryTool,
  // RAG search tool would go here when implemented
];

/**
 * Tools for the Analyst worker (performance analysis)
 */
export const analystTools = [
  getUserProfileTool,
  getLastActivityTool,
  getRecentActivitiesTool,
  getHRZoneSummaryTool,
  getThisWeekAdherenceTool,
];

/**
 * Tools for the Architect worker (plan modification)
 * Note: Workout modification tools are imported from workoutTools.ts
 */
export const architectDataTools = [
  getUserProfileTool,
  getUpcomingWorkoutsTool,
  getThisWeekAdherenceTool,
];

/**
 * Tools for the Conversational worker (general chat)
 * Read-only, minimal data tools
 */
export const conversationalTools = [
  getUserProfileTool,
  getThisWeekAdherenceTool,
];

/**
 * All data tools combined
 */
export const allDataTools = [
  getUserProfileTool,
  getUpcomingWorkoutsTool,
  getLastActivityTool,
  getRecentActivitiesTool,
  getThisWeekAdherenceTool,
  getHRZoneSummaryTool,
  getHistoricalSummariesTool,
];
