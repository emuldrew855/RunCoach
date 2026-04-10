import { Request, Response } from 'express';
import { getActivitiesByUserId, getActivityStats, getActivityByIdForUser, getActivityInsights, getLinkedPlannedWorkout } from '../models/Activity';
import { syncActivities } from '../services/activityService';
import { getHRZoneSummary } from '../models/ActivityHRZone';
import { getActivityZones } from '../services/stravaService';
import { recomputeDailyInsight } from '../services/dailyInsightService';
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
