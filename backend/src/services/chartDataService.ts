import { query } from '../config/database';
import {
  PaceComparisonData,
  SplitComparisonData,
  HRZoneDistributionData,
  ExecutionScoreTrendData,
  SimilarWorkoutsData,
  PBProgressionData,
  ChartDataQueryParams,
} from '../types/chartData';
import { Activity } from '../types/models';

const HR_ZONE_COLORS = {
  1: '#10b981', // Green - Easy
  2: '#3b82f6', // Blue - Aerobic
  3: '#f59e0b', // Amber - Tempo
  4: '#ef4444', // Red - Threshold
  5: '#dc2626', // Dark Red - VO2 Max
};

const HR_ZONE_NAMES = {
  1: 'Zone 1 (Easy)',
  2: 'Zone 2 (Aerobic)',
  3: 'Zone 3 (Tempo)',
  4: 'Zone 4 (Threshold)',
  5: 'Zone 5 (VO2 Max)',
};

/**
 * Find similar activities based on distance and optional workout type
 */
export async function getSimilarActivities(
  userId: number,
  activityId: number,
  options: {
    distanceRange?: [number, number];
    workoutType?: string;
    limit?: number;
  } = {}
): Promise<Activity[]> {
  const activity = await query(
    'SELECT * FROM activities WHERE id = $1 AND user_id = $2',
    [activityId, userId]
  );

  if (!activity.rows[0]) {
    throw new Error('Activity not found');
  }

  const baseActivity = activity.rows[0];
  const distanceMin = options.distanceRange
    ? options.distanceRange[0]
    : baseActivity.distance_meters * 0.9;
  const distanceMax = options.distanceRange
    ? options.distanceRange[1]
    : baseActivity.distance_meters * 1.1;

  let queryText = `
    SELECT a.*, di.execution_score, di.pace_delta
    FROM activities a
    LEFT JOIN daily_run_insights di ON di.activity_id = a.id
    WHERE a.user_id = $1
      AND a.distance_meters BETWEEN $2 AND $3
      AND a.id != $4
  `;

  const params: any[] = [userId, distanceMin, distanceMax, activityId];

  if (options.workoutType) {
    queryText += ` AND a.workout_type = $5`;
    params.push(options.workoutType);
  }

  queryText += ` ORDER BY a.start_date DESC LIMIT ${options.limit || 5}`;

  const result = await query(queryText, params);
  return result.rows;
}

/**
 * Get pace comparison data for line chart
 */
export async function getPaceComparisonData(
  userId: number,
  params: ChartDataQueryParams
): Promise<PaceComparisonData> {
  const { activityId, distanceRange, limit = 5 } = params;

  if (!activityId) {
    throw new Error('activityId is required');
  }

  // Get current activity
  const currentActivity = await query(
    'SELECT * FROM activities WHERE id = $1 AND user_id = $2',
    [activityId, userId]
  );

  if (!currentActivity.rows[0]) {
    throw new Error('Activity not found');
  }

  const current = currentActivity.rows[0];
  const currentSplits = current.splits_metric;

  // FALLBACK: If no splits, show average pace trend over time for similar runs
  if (!currentSplits || currentSplits.length === 0) {
    // Get similar activities from past 8 weeks, ordered by date
    // Use tighter distance range (±5%) for more relevant comparisons (e.g., 8km runs only match 7.6-8.4km)
    const similarActivitiesResult = await query(
      `SELECT a.id, a.name, a.start_date_local, a.start_date, a.distance_meters,
              a.moving_time_seconds, a.average_speed
       FROM activities a
       WHERE a.user_id = $1
         AND a.distance_meters BETWEEN $2 AND $3
         AND a.start_date >= NOW() - INTERVAL '8 weeks'
         AND a.id != $4
       ORDER BY a.start_date ASC
       LIMIT 20`,
      [
        userId,
        current.distance_meters * 0.95,
        current.distance_meters * 1.05,
        activityId,
      ]
    );

    const similarActivities = similarActivitiesResult.rows;

    // Calculate current activity's average pace (min/km)
    const currentPace = current.average_speed
      ? parseFloat((1000 / current.average_speed / 60).toFixed(2))
      : parseFloat((current.moving_time_seconds / 60 / (current.distance_meters / 1000)).toFixed(2));

    // Build data points for similar activities (chronological)
    const avgData = similarActivities.map((activity, idx) => {
      const pace = activity.average_speed
        ? parseFloat((1000 / activity.average_speed / 60).toFixed(2))
        : parseFloat((activity.moving_time_seconds / 60 / (activity.distance_meters / 1000)).toFixed(2));

      const date = new Date(activity.start_date_local || activity.start_date);

      return {
        x: idx + 1,
        y: pace,
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        activityId: activity.id,
        name: activity.name || 'Run',
        distance: activity.distance_meters,
        duration: activity.moving_time_seconds,
        date: date.toISOString(),
      };
    });

    // Add current run at the end
    const currentData = [{
      x: avgData.length + 1,
      y: currentPace,
      label: 'Today',
      activityId: current.id,
      name: current.name || 'Current Run',
      distance: current.distance_meters,
      duration: current.moving_time_seconds,
      date: new Date(current.start_date_local || current.start_date).toISOString(),
    }];

    // Calculate average and best pace from similar activities
    const paces = similarActivities.map(a =>
      a.average_speed
        ? 1000 / a.average_speed / 60
        : a.moving_time_seconds / 60 / (a.distance_meters / 1000)
    );

    const averagePace = paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : currentPace;
    const bestPace = paces.length > 0 ? Math.min(...paces) : currentPace;

    return {
      current: currentData,
      average: avgData,
      best: [], // Not applicable for trend view
      metadata: {
        activityId,
        distance: current.distance_meters,
        date: current.start_date_local || current.start_date,
        comparisonCount: similarActivities.length,
        fallbackMode: 'average_pace_trend', // Indicate we're using fallback
        averagePace: parseFloat(averagePace.toFixed(2)),
        bestPace: parseFloat(bestPace.toFixed(2)),
        currentPace,
      },
    };
  }

  // STANDARD MODE: Activity has splits, show per-km pace comparison
  // Get similar activities
  const similarActivities = await getSimilarActivities(userId, activityId, {
    distanceRange,
    limit,
  });

  // Build current pace data points
  const currentData = currentSplits.map((split: any, idx: number) => ({
    x: idx + 1,
    y: parseFloat((split.moving_time / 60).toFixed(2)), // Convert seconds to minutes
    label: `KM ${idx + 1}`,
  }));

  // Calculate average pace per km from similar activities
  const avgData: any[] = [];
  const bestData: any[] = [];

  for (let km = 0; km < currentSplits.length; km++) {
    const kmPaces: number[] = [];

    similarActivities.forEach((activity) => {
      const splits = activity.splits_metric;
      if (splits && splits[km]) {
        kmPaces.push(splits[km].moving_time / 60);
      }
    });

    if (kmPaces.length > 0) {
      const avgPace = kmPaces.reduce((a, b) => a + b, 0) / kmPaces.length;
      const bestPace = Math.min(...kmPaces);

      avgData.push({
        x: km + 1,
        y: parseFloat(avgPace.toFixed(2)),
        label: `KM ${km + 1}`,
      });

      bestData.push({
        x: km + 1,
        y: parseFloat(bestPace.toFixed(2)),
        label: `KM ${km + 1}`,
      });
    }
  }

  return {
    current: currentData,
    average: avgData,
    best: bestData,
    metadata: {
      activityId,
      distance: current.distance_meters,
      date: current.start_date_local || current.start_date,
      comparisonCount: similarActivities.length,
    },
  };
}

/**
 * Get split comparison data for bar chart
 */
export async function getSplitComparisonData(
  userId: number,
  params: ChartDataQueryParams
): Promise<SplitComparisonData> {
  const { activityId, distanceRange, limit = 5 } = params;

  if (!activityId) {
    throw new Error('activityId is required');
  }

  // Get current activity
  const currentActivity = await query(
    'SELECT * FROM activities WHERE id = $1 AND user_id = $2',
    [activityId, userId]
  );

  if (!currentActivity.rows[0]) {
    throw new Error('Activity not found');
  }

  const current = currentActivity.rows[0];
  const currentSplits = current.splits_metric;

  if (!currentSplits || currentSplits.length === 0) {
    throw new Error('Activity has no split data');
  }

  // Get similar activities
  const similarActivities = await getSimilarActivities(userId, activityId, {
    distanceRange,
    limit,
  });

  // Build split comparison data
  const splits = currentSplits.map((split: any, idx: number) => {
    const currentPace = split.moving_time / 60;

    // Calculate average from similar activities
    const similarPaces: number[] = [];
    let bestPace: number | undefined;

    similarActivities.forEach((activity) => {
      const activitySplits = activity.splits_metric;
      if (activitySplits && activitySplits[idx]) {
        const pace = activitySplits[idx].moving_time / 60;
        similarPaces.push(pace);
        if (!bestPace || pace < bestPace) {
          bestPace = pace;
        }
      }
    });

    const avgPace =
      similarPaces.length > 0
        ? similarPaces.reduce((a, b) => a + b, 0) / similarPaces.length
        : 0;

    return {
      km: idx + 1,
      current: parseFloat(currentPace.toFixed(2)),
      average: parseFloat(avgPace.toFixed(2)),
      best: bestPace ? parseFloat(bestPace.toFixed(2)) : undefined,
    };
  });

  return {
    splits,
    metadata: {
      activityId,
      distance: current.distance_meters,
      date: current.start_date_local || current.start_date,
      comparisonCount: similarActivities.length,
    },
  };
}

/**
 * Get HR zone distribution data for stacked bar chart
 */
export async function getHRZoneDistribution(
  userId: number,
  params: ChartDataQueryParams
): Promise<HRZoneDistributionData> {
  const { activityId } = params;

  if (!activityId) {
    throw new Error('activityId is required');
  }

  // Get activity HR zone data
  const result = await query(
    `SELECT ahz.*, a.moving_time_seconds
     FROM activity_hr_zones ahz
     JOIN activities a ON a.id = ahz.activity_id
     WHERE ahz.activity_id = $1 AND ahz.user_id = $2`,
    [activityId, userId]
  );

  if (!result.rows[0]) {
    // Get activity date for metadata even when no HR zone data
    const activityDateResult = await query(
      'SELECT start_date_local, start_date FROM activities WHERE id = $1',
      [activityId]
    );
    // Return empty data structure when no HR zone data exists
    return {
      zones: [],
      metadata: {
        activityId,
        date: activityDateResult.rows[0]?.start_date_local ||
              activityDateResult.rows[0]?.start_date ||
              new Date(),
        totalDuration: 0,
      },
    };
  }

  const hrData = result.rows[0];
  const totalDuration = hrData.moving_time_seconds;

  // Build zone distribution
  const zones = [
    {
      zone: 1,
      name: HR_ZONE_NAMES[1],
      duration: hrData.zone_1_seconds,
      percentage: parseFloat(
        ((hrData.zone_1_seconds / totalDuration) * 100).toFixed(1)
      ),
      color: HR_ZONE_COLORS[1],
    },
    {
      zone: 2,
      name: HR_ZONE_NAMES[2],
      duration: hrData.zone_2_seconds,
      percentage: parseFloat(
        ((hrData.zone_2_seconds / totalDuration) * 100).toFixed(1)
      ),
      color: HR_ZONE_COLORS[2],
    },
    {
      zone: 3,
      name: HR_ZONE_NAMES[3],
      duration: hrData.zone_3_seconds,
      percentage: parseFloat(
        ((hrData.zone_3_seconds / totalDuration) * 100).toFixed(1)
      ),
      color: HR_ZONE_COLORS[3],
    },
    {
      zone: 4,
      name: HR_ZONE_NAMES[4],
      duration: hrData.zone_4_seconds,
      percentage: parseFloat(
        ((hrData.zone_4_seconds / totalDuration) * 100).toFixed(1)
      ),
      color: HR_ZONE_COLORS[4],
    },
    {
      zone: 5,
      name: HR_ZONE_NAMES[5],
      duration: hrData.zone_5_seconds,
      percentage: parseFloat(
        ((hrData.zone_5_seconds / totalDuration) * 100).toFixed(1)
      ),
      color: HR_ZONE_COLORS[5],
    },
  ];

  // Get activity date
  const activityData = await query(
    'SELECT start_date_local, start_date FROM activities WHERE id = $1',
    [activityId]
  );

  return {
    zones,
    metadata: {
      activityId,
      date:
        activityData.rows[0]?.start_date_local ||
        activityData.rows[0]?.start_date,
      totalDuration,
    },
  };
}

/**
 * Get execution score trend for workout type
 */
export async function getExecutionScoreTrend(
  userId: number,
  params: ChartDataQueryParams
): Promise<ExecutionScoreTrendData> {
  const { workoutType, limit = 10, days = 90 } = params;

  let queryText = `
    SELECT
      a.id as activity_id,
      a.start_date_local as date,
      a.distance_meters,
      di.execution_score
    FROM activities a
    JOIN daily_run_insights di ON di.activity_id = a.id
    WHERE a.user_id = $1
      AND di.execution_score IS NOT NULL
      AND a.start_date >= NOW() - INTERVAL '${days} days'
  `;

  const queryParams: any[] = [userId];

  if (workoutType) {
    queryText += ` AND a.workout_type = $2`;
    queryParams.push(workoutType);
  }

  queryText += ` ORDER BY a.start_date DESC LIMIT ${limit}`;

  const result = await query(queryText, queryParams);

  const trend = result.rows.map((row) => ({
    date: row.date,
    score: parseFloat(row.execution_score?.toFixed(1) || '0'),
    activityId: row.activity_id,
    distance: row.distance_meters,
  }));

  const avgScore =
    trend.length > 0
      ? trend.reduce((sum, item) => sum + item.score, 0) / trend.length
      : 0;

  return {
    trend: trend.reverse(), // Show oldest to newest
    metadata: {
      workoutType,
      averageScore: parseFloat(avgScore.toFixed(1)),
      count: trend.length,
    },
  };
}

/**
 * Get similar workouts data
 */
export async function getSimilarWorkoutsData(
  userId: number,
  params: ChartDataQueryParams
): Promise<SimilarWorkoutsData> {
  const { activityId, distanceRange, workoutType, limit = 5 } = params;

  if (!activityId) {
    throw new Error('activityId is required');
  }

  const similarActivities = await getSimilarActivities(userId, activityId, {
    distanceRange,
    workoutType,
    limit,
  });

  const workouts = similarActivities.map((activity) => ({
    activityId: activity.id,
    date: activity.start_date_local || activity.start_date,
    distance: activity.distance_meters,
    pace: activity.average_speed
      ? parseFloat((1000 / activity.average_speed / 60).toFixed(2))
      : 0,
    executionScore: activity.execution_score
      ? parseFloat(activity.execution_score.toFixed(1))
      : undefined,
    isCurrent: activity.id === activityId,
  }));

  // Add current activity if not already in list
  if (!workouts.find((w) => w.activityId === activityId)) {
    const currentActivity = await query(
      'SELECT * FROM activities WHERE id = $1',
      [activityId]
    );
    const current = currentActivity.rows[0];

    workouts.unshift({
      activityId: current.id,
      date: current.start_date_local || current.start_date,
      distance: current.distance_meters,
      pace: current.average_speed
        ? parseFloat((1000 / current.average_speed / 60).toFixed(2))
        : 0,
      executionScore: undefined,
      isCurrent: true,
    });
  }

  return {
    workouts,
    metadata: {
      currentActivityId: activityId,
      distanceRange: distanceRange || [0, 0],
      workoutType,
    },
  };
}

/**
 * Get personal best progression data
 */
export async function getPBProgression(
  userId: number,
  params: ChartDataQueryParams
): Promise<PBProgressionData> {
  const { distance, days = 365 } = params;

  if (!distance) {
    throw new Error('distance is required');
  }

  // Get activities within ±5% of target distance
  const distanceMin = distance * 0.95;
  const distanceMax = distance * 1.05;

  const result = await query(
    `SELECT
      id as activity_id,
      start_date_local as date,
      distance_meters,
      moving_time_seconds as time
    FROM activities
    WHERE user_id = $1
      AND distance_meters BETWEEN $2 AND $3
      AND start_date >= NOW() - INTERVAL '${days} days'
    ORDER BY start_date ASC`,
    [userId, distanceMin, distanceMax]
  );

  let currentPB: number | null = null;
  const progression = result.rows.map((row) => {
    const isPB = currentPB === null || row.time < currentPB;
    if (isPB) {
      currentPB = row.time;
    }

    return {
      date: row.date,
      time: row.time,
      distance: row.distance_meters,
      activityId: row.activity_id,
      isPB,
    };
  });

  const improvements = progression.filter((p) => p.isPB).length;

  return {
    progression,
    metadata: {
      distance,
      currentPB: currentPB || 0,
      improvements,
    },
  };
}
