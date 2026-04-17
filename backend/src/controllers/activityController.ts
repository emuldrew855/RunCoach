import { Request, Response } from 'express';
import { getActivitiesByUserId, getActivityStats, getActivityByIdForUser, getActivityInsights, getLinkedPlannedWorkout } from '../models/Activity';
import { syncActivities, relinkActivitiesToWorkouts } from '../services/activityService';
import { getHRZoneSummary } from '../models/ActivityHRZone';
import { getActivityZones, getActivityStreamsForAnalysis } from '../services/stravaService';
import { recomputeDailyInsight } from '../services/dailyInsightService';
import { processStreamsIntoSplits, ProcessedSplitsResult } from '../services/splitBucketingService';
import { query } from '../config/database';

export async function getActivities(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const activities = await getActivitiesByUserId(userId, limit, offset);
    res.json({ activities });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
}

export async function getActivityDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const activityId = parseInt(req.params.id);
    const refresh = req.query.refresh === 'true';

    if (!activityId || isNaN(activityId)) {
      res.status(400).json({ error: 'Invalid activity ID' });
      return;
    }

    const activity = await getActivityByIdForUser(activityId, userId);

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    // Get linked planned workout (if this activity was linked to a workout)
    const plannedWorkout = await getLinkedPlannedWorkout(activityId);

    // If refresh is requested, recompute insights with the current planned workout data
    if (refresh) {
      console.log(`🔄 Refreshing insights for activity ${activityId}...`);
      await recomputeDailyInsight(userId, activityId);
    }

    // Get pre-computed insights for this activity
    const insights = await getActivityInsights(activityId);

    res.json({
      activity,
      insights,
      plannedWorkout,
    });
  } catch (error) {
    console.error('Get activity detail error:', error);
    res.status(500).json({ error: 'Failed to get activity details' });
  }
}

export async function recomputeActivityInsights(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const activityId = parseInt(req.params.id);

    if (!activityId || isNaN(activityId)) {
      res.status(400).json({ error: 'Invalid activity ID' });
      return;
    }

    // Verify the activity belongs to this user
    const activity = await getActivityByIdForUser(activityId, userId);
    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    // Recompute insights
    const insight = await recomputeDailyInsight(userId, activityId);

    if (!insight) {
      res.status(500).json({ error: 'Failed to recompute insights' });
      return;
    }

    res.json({
      message: 'Insights recomputed successfully',
      insights: {
        pacing: insight.pacing,
        hrBehavior: insight.hrBehavior,
        effort: insight.effort,
        compliance: insight.compliance,
        risks: insight.risks,
        coachingPoints: insight.coachingPoints,
      },
    });
  } catch (error) {
    console.error('Recompute insights error:', error);
    res.status(500).json({ error: 'Failed to recompute insights' });
  }
}

export async function syncActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const count = await syncActivities(userId);
    res.json({ message: `Synced ${count} activities`, count });
  } catch (error) {
    console.error('Sync activities error:', error);
    res.status(500).json({ error: 'Failed to sync activities' });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;
    const stats = await getActivityStats(userId, days);
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}

export async function getHRZones(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;
    const summary = await getHRZoneSummary(userId, days);

    // Convert to hours for frontend
    const hrZoneData = {
      zone1Hours: Number(summary.total_zone_1) / 3600,
      zone2Hours: Number(summary.total_zone_2) / 3600,
      zone3Hours: Number(summary.total_zone_3) / 3600,
      zone4Hours: Number(summary.total_zone_4) / 3600,
      zone5Hours: Number(summary.total_zone_5) / 3600,
      totalHours: (
        Number(summary.total_zone_1) +
        Number(summary.total_zone_2) +
        Number(summary.total_zone_3) +
        Number(summary.total_zone_4) +
        Number(summary.total_zone_5)
      ) / 3600,
    };

    res.json({ hrZones: hrZoneData });
  } catch (error) {
    console.error('Get HR zones error:', error);
    res.status(500).json({ error: 'Failed to get HR zones' });
  }
}

export async function getActivityZonesController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const activityId = parseInt(req.params.id);

    if (!activityId || isNaN(activityId)) {
      res.status(400).json({ error: 'Invalid activity ID' });
      return;
    }

    const zones = await getActivityZones(userId, activityId);

    if (zones === null) {
      res.status(404).json({
        error: 'Zones data not available for this activity',
        message: 'This may not be a Summit feature or the activity does not have zones data'
      });
      return;
    }

    res.json({ zones });
  } catch (error) {
    console.error('Get activity zones error:', error);
    res.status(500).json({ error: 'Failed to get activity zones' });
  }
}

export async function getWeeklyVolume(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const weeks = parseInt(req.query.weeks as string) || 16;
    const includePlanned = req.query.includePlanned !== 'false';
    const futureWeeks = parseInt(req.query.futureWeeks as string) || 4;
    const weekStartsOn = (req.query.weekStartsOn as string) || 'monday';

    // Calculate the start date for historical data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));

    // Build week truncation expression based on user preference
    // For Sunday start: shift date forward 1 day, truncate to week, then shift back 1 day
    // For Monday start: use default DATE_TRUNC('week', ...)
    const weekTruncExpr = weekStartsOn === 'sunday'
      ? `DATE_TRUNC('week', start_date + INTERVAL '1 day') - INTERVAL '1 day'`
      : `DATE_TRUNC('week', start_date)`;

    // Get weekly activity volume
    const activitiesQuery = await query(
      `SELECT
        ${weekTruncExpr} AS week_start,
        SUM(distance_meters) / 1000.0 AS distance_km,
        COUNT(*) AS activity_count
      FROM activities
      WHERE user_id = $1
        AND start_date >= $2
        AND sport_type IN ('Run', 'TrailRun', 'VirtualRun')
      GROUP BY week_start
      ORDER BY week_start ASC`,
      [userId, startDate]
    );

    // Get weekly planned volume if requested
    let plannedQuery = null;
    if (includePlanned) {
      // Calculate endDate to include full weeks
      // Add extra days to ensure we capture the complete last week
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (futureWeeks * 7) + 6);

      // Use same week truncation expression for planned workouts
      const plannedWeekTruncExpr = weekStartsOn === 'sunday'
        ? `DATE_TRUNC('week', scheduled_date + INTERVAL '1 day') - INTERVAL '1 day'`
        : `DATE_TRUNC('week', scheduled_date)`;

      plannedQuery = await query(
        `SELECT
          ${plannedWeekTruncExpr} AS week_start,
          SUM(target_distance_meters) / 1000.0 AS planned_distance_km,
          COUNT(*) AS workout_count
        FROM planned_workouts pw
        JOIN training_plans tp ON pw.training_plan_id = tp.id
        WHERE tp.user_id = $1
          AND tp.is_active = true
          AND scheduled_date >= CURRENT_DATE
          AND scheduled_date <= $2
          AND completion_status = 'pending'
        GROUP BY week_start
        ORDER BY week_start ASC`,
        [userId, endDate]
      );
    }

    // Combine historical and planned data
    const weeklyData: any[] = [];
    const weekMap = new Map();

    // Add historical activities
    activitiesQuery.rows.forEach((row) => {
      const weekStart = new Date(row.week_start);
      const weekKey = weekStart.toISOString().split('T')[0];

      weekMap.set(weekKey, {
        weekStart: weekStart.toISOString(),
        weekLabel: formatWeekLabel(weekStart),
        actualDistance: parseFloat(row.distance_km) || 0,
        plannedDistance: null,
        activityCount: parseInt(row.activity_count) || 0,
        isHistorical: true,
        isCurrent: isCurrentWeek(weekStart, weekStartsOn as 'sunday' | 'monday'),
      });
    });

    // Add planned workouts
    if (plannedQuery) {
      plannedQuery.rows.forEach((row) => {
        const weekStart = new Date(row.week_start);
        const weekKey = weekStart.toISOString().split('T')[0];

        const existing = weekMap.get(weekKey);
        if (existing) {
          existing.plannedDistance = parseFloat(row.planned_distance_km) || 0;
          existing.workoutCount = parseInt(row.workout_count) || 0;
        } else {
          weekMap.set(weekKey, {
            weekStart: weekStart.toISOString(),
            weekLabel: formatWeekLabel(weekStart),
            actualDistance: 0,
            plannedDistance: parseFloat(row.planned_distance_km) || 0,
            workoutCount: parseInt(row.workout_count) || 0,
            activityCount: 0,
            isHistorical: false,
            isCurrent: isCurrentWeek(weekStart, weekStartsOn as 'sunday' | 'monday'),
          });
        }
      });
    }

    // Convert map to sorted array
    weeklyData.push(...Array.from(weekMap.values()).sort((a, b) =>
      new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
    ));

    res.json({ weeklyData });
  } catch (error) {
    console.error('Get weekly volume error:', error);
    res.status(500).json({ error: 'Failed to get weekly volume' });
  }
}

// Helper function to format week labels
function formatWeekLabel(date: Date): string {
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

// Helper function to check if a week is the current week
function isCurrentWeek(weekStart: Date, weekStartsOn: 'sunday' | 'monday' = 'monday'): boolean {
  const now = new Date();
  const currentWeekStart = new Date(now);

  // Calculate the start of current week based on preference
  if (weekStartsOn === 'sunday') {
    // getDay() returns 0 (Sunday) to 6 (Saturday)
    currentWeekStart.setDate(now.getDate() - now.getDay());
  } else {
    // For Monday start: adjust so Monday = 0, Sunday = 6
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setDate(now.getDate() - daysFromMonday);
  }
  currentWeekStart.setHours(0, 0, 0, 0);

  const weekStartNormalized = new Date(weekStart);
  weekStartNormalized.setHours(0, 0, 0, 0);

  return weekStartNormalized.getTime() === currentWeekStart.getTime();
}

/**
 * Re-link activities to planned workouts using correct local dates.
 * This repairs data that may have been incorrectly linked due to timezone issues.
 */
export async function relinkActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const result = await relinkActivitiesToWorkouts(userId);

    res.json({
      message: 'Activity re-linking complete',
      ...result,
    });
  } catch (error) {
    console.error('Re-link activities error:', error);
    res.status(500).json({ error: 'Failed to re-link activities' });
  }
}

/**
 * Get processed splits with per-km HR analysis
 * Will compute and cache if not already processed
 */
export async function getProcessedSplits(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const activityId = parseInt(req.params.id);
    const forceRecompute = req.query.recompute === 'true';

    if (!activityId || isNaN(activityId)) {
      res.status(400).json({ error: 'Invalid activity ID' });
      return;
    }

    // Verify activity belongs to user and get Strava ID
    const activityResult = await query(
      `SELECT id, strava_activity_id, processed_splits, splits_processed_at
       FROM activities
       WHERE id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    if (activityResult.rows.length === 0) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    const activity = activityResult.rows[0];

    // Return cached splits if available and not forcing recompute
    if (activity.processed_splits && !forceRecompute) {
      res.json({
        cached: true,
        processed_at: activity.splits_processed_at,
        ...activity.processed_splits,
      });
      return;
    }

    // Fetch streams from Strava and process
    console.log(`🏃 Processing splits for activity ${activityId} (Strava ID: ${activity.strava_activity_id})`);

    const streams = await getActivityStreamsForAnalysis(userId, activity.strava_activity_id);

    if (!streams.distance?.data || !streams.time?.data) {
      res.status(404).json({
        error: 'Stream data not available for this activity',
        message: 'This activity may not have detailed GPS/stream data from Strava',
      });
      return;
    }

    const processedSplits = await processStreamsIntoSplits(userId, activityId, streams);

    if (!processedSplits) {
      res.status(500).json({ error: 'Failed to process splits' });
      return;
    }

    // Cache the processed splits
    await query(
      `UPDATE activities
       SET processed_splits = $1, splits_processed_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(processedSplits), activityId]
    );

    console.log(`✅ Processed ${processedSplits.splits.length} splits for activity ${activityId}`);

    res.json({
      cached: false,
      processed_at: new Date().toISOString(),
      ...processedSplits,
    });
  } catch (error: any) {
    console.error('Get processed splits error:', error);
    res.status(500).json({ error: 'Failed to get processed splits', details: error.message });
  }
}

/**
 * Batch process splits for multiple activities
 * Useful for backfilling historical activities
 */
export async function batchProcessSplits(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { activityIds, limit = 10 } = req.body;

    let activitiesToProcess: any[];

    if (activityIds && Array.isArray(activityIds)) {
      // Process specific activities
      const result = await query(
        `SELECT id, strava_activity_id
         FROM activities
         WHERE id = ANY($1) AND user_id = $2 AND processed_splits IS NULL`,
        [activityIds, userId]
      );
      activitiesToProcess = result.rows;
    } else {
      // Process recent unprocessed activities
      const result = await query(
        `SELECT id, strava_activity_id
         FROM activities
         WHERE user_id = $1
           AND processed_splits IS NULL
           AND distance_meters > 1000
         ORDER BY start_date DESC
         LIMIT $2`,
        [userId, limit]
      );
      activitiesToProcess = result.rows;
    }

    let processed = 0;
    let failed = 0;
    const results: { id: number; success: boolean; splits?: number; error?: string }[] = [];

    for (const activity of activitiesToProcess) {
      try {
        const streams = await getActivityStreamsForAnalysis(userId, activity.strava_activity_id);

        if (streams.distance?.data && streams.time?.data) {
          const processedSplits = await processStreamsIntoSplits(userId, activity.id, streams);

          if (processedSplits) {
            await query(
              `UPDATE activities
               SET processed_splits = $1, splits_processed_at = NOW()
               WHERE id = $2`,
              [JSON.stringify(processedSplits), activity.id]
            );

            processed++;
            results.push({ id: activity.id, success: true, splits: processedSplits.splits.length });
          } else {
            failed++;
            results.push({ id: activity.id, success: false, error: 'Processing returned null' });
          }
        } else {
          failed++;
          results.push({ id: activity.id, success: false, error: 'No stream data available' });
        }
      } catch (error: any) {
        failed++;
        results.push({ id: activity.id, success: false, error: error.message });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    res.json({
      message: `Processed ${processed} activities, ${failed} failed`,
      processed,
      failed,
      total: activitiesToProcess.length,
      results,
    });
  } catch (error: any) {
    console.error('Batch process splits error:', error);
    res.status(500).json({ error: 'Failed to batch process splits', details: error.message });
  }
}
