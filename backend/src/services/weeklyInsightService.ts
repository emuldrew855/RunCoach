/**
 * Weekly Insight Service
 *
 * Computes weekly training aggregations every Sunday evening.
 * Analyzes the past week's training and generates guidance for the upcoming week.
 *
 * Computed insights include:
 * - Volume analysis and week-over-week trends
 * - Adherence metrics (planned vs completed)
 * - Performance pattern changes
 * - Training load distribution
 * - Risk assessment
 * - Next week recommendations
 */

import pool from '../config/database';
import { WeeklyInsight } from '../types/insights';

/**
 * Compute weekly insight for a specific user and week
 *
 * Should be called every Sunday evening for all active users
 */
export async function computeWeeklyInsight(
  userId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyInsight> {
  console.log(`🔍 Computing weekly insight for user ${userId} (${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]})...`);

  try {
    // 1. Analyze volume
    const volumeAnalysis = await analyzeVolume(userId, weekStart, weekEnd);

    // 2. Track adherence
    const adherenceTracking = await trackAdherence(userId, weekStart, weekEnd);

    // 3. Detect pattern changes
    const patternChanges = await detectPatternChanges(userId, weekStart, weekEnd);

    // 4. Analyze training load
    const trainingLoad = await analyzeTrainingLoad(userId, weekStart, weekEnd);

    // 5. Assess weekly risks
    const weeklyRisks = assessWeeklyRisks(volumeAnalysis, adherenceTracking, patternChanges, trainingLoad);

    // 6. Generate next week guidance
    const nextWeekGuidance = generateNextWeekGuidance(
      volumeAnalysis,
      adherenceTracking,
      weeklyRisks,
      trainingLoad
    );

    const insight: WeeklyInsight = {
      userId,
      weekStart,
      weekEnd,
      volume: volumeAnalysis,
      adherence: adherenceTracking,
      patterns: patternChanges,
      trainingLoad,
      weeklyRisks,
      nextWeekGuidance
    };

    // Store in database
    await storeWeeklyInsight(insight);

    console.log(`✓ Weekly insight computed and stored for user ${userId}`);
    return insight;

  } catch (error) {
    console.error(`Error computing weekly insight for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Analyze volume trends
 */
async function analyzeVolume(
  userId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyInsight['volume']> {
  // Get this week's activities
  const thisWeekResult = await pool.query(
    `SELECT
       COALESCE(SUM(distance / 1000.0), 0) as total_distance
     FROM activities
     WHERE user_id = $1
       AND start_date >= $2
       AND start_date < $3`,
    [userId, weekStart, weekEnd]
  );

  const totalDistance = parseFloat(thisWeekResult.rows[0]?.total_distance || '0');

  // Get this week's planned distance
  const plannedResult = await pool.query(
    `SELECT
       COALESCE(SUM(target_distance_meters / 1000.0), 0) as planned_distance
     FROM planned_workouts
     WHERE user_id = $1
       AND scheduled_date >= $2
       AND scheduled_date < $3`,
    [userId, weekStart, weekEnd]
  );

  const plannedDistance = parseFloat(plannedResult.rows[0]?.planned_distance || '0');

  // Get last week's distance for comparison
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);

  const lastWeekResult = await pool.query(
    `SELECT
       COALESCE(SUM(distance / 1000.0), 0) as total_distance
     FROM activities
     WHERE user_id = $1
       AND start_date >= $2
       AND start_date < $3`,
    [userId, lastWeekStart, lastWeekEnd]
  );

  const lastWeekDistance = parseFloat(lastWeekResult.rows[0]?.total_distance || '0');

  // Calculate metrics
  const deviation = plannedDistance > 0 ? ((totalDistance - plannedDistance) / plannedDistance * 100) : 0;
  const weekOverWeekChange = lastWeekDistance > 0 ? ((totalDistance - lastWeekDistance) / lastWeekDistance * 100) : 0;

  let trendDirection: 'increasing' | 'stable' | 'decreasing';
  if (weekOverWeekChange > 5) trendDirection = 'increasing';
  else if (weekOverWeekChange < -5) trendDirection = 'decreasing';
  else trendDirection = 'stable';

  // Volume risk based on 10% rule
  let volumeRisk: 'safe' | 'caution' | 'danger';
  if (weekOverWeekChange > 15) volumeRisk = 'danger';
  else if (weekOverWeekChange > 10) volumeRisk = 'caution';
  else volumeRisk = 'safe';

  return {
    totalDistance,
    plannedDistance,
    deviation: Math.round(deviation * 10) / 10,
    weekOverWeekChange: Math.round(weekOverWeekChange * 10) / 10,
    trendDirection,
    volumeRisk
  };
}

/**
 * Track adherence metrics
 */
async function trackAdherence(
  userId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyInsight['adherence']> {
  // Get planned workouts
  const plannedResult = await pool.query(
    `SELECT
       COUNT(*) as planned,
       COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) as completed,
       COUNT(CASE WHEN completion_status = 'skipped' THEN 1 END) as skipped,
       ARRAY_AGG(DISTINCT workout_type) FILTER (WHERE completion_status = 'skipped') as skipped_types
     FROM planned_workouts
     WHERE user_id = $1
       AND scheduled_date >= $2
       AND scheduled_date < $3`,
    [userId, weekStart, weekEnd]
  );

  const row = plannedResult.rows[0];
  const workoutsPlanned = parseInt(row.planned || '0');
  const workoutsCompleted = parseInt(row.completed || '0');
  const workoutsSkipped = parseInt(row.skipped || '0');
  const skippedTypes = row.skipped_types || [];

  const adherenceRate = workoutsPlanned > 0 ? (workoutsCompleted / workoutsPlanned * 100) : 100;

  // Simple compliance score based on adherence and modifications
  let complianceScore = adherenceRate;
  if (adherenceRate >= 90) complianceScore = 95;
  else if (adherenceRate >= 75) complianceScore = 85;
  else if (adherenceRate >= 60) complianceScore = 70;
  else complianceScore = Math.max(40, adherenceRate);

  return {
    workoutsPlanned,
    workoutsCompleted,
    workoutsSkipped,
    adherenceRate: Math.round(adherenceRate),
    skippedTypes: skippedTypes.filter((t: string) => t != null),
    complianceScore: Math.round(complianceScore)
  };
}

/**
 * Detect pattern changes vs last week
 */
async function detectPatternChanges(
  userId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyInsight['patterns']> {
  // Get this week's average pace and HR
  const thisWeekResult = await pool.query(
    `SELECT
       AVG(average_speed) as avg_speed,
       AVG(average_heartrate) as avg_hr
     FROM activities
     WHERE user_id = $1
       AND start_date >= $2
       AND start_date < $3
       AND average_speed > 0`,
    [userId, weekStart, weekEnd]
  );

  const thisWeekAvgSpeed = parseFloat(thisWeekResult.rows[0]?.avg_speed || '0');
  const thisWeekAvgHR = parseFloat(thisWeekResult.rows[0]?.avg_hr || '0');
  const thisWeekAvgPace = thisWeekAvgSpeed > 0 ? 1000 / (thisWeekAvgSpeed * 60) : 0;

  // Get last week's average pace and HR
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);

  const lastWeekResult = await pool.query(
    `SELECT
       AVG(average_speed) as avg_speed,
       AVG(average_heartrate) as avg_hr
     FROM activities
     WHERE user_id = $1
       AND start_date >= $2
       AND start_date < $3
       AND average_speed > 0`,
    [userId, lastWeekStart, lastWeekEnd]
  );

  const lastWeekAvgSpeed = parseFloat(lastWeekResult.rows[0]?.avg_speed || '0');
  const lastWeekAvgHR = parseFloat(lastWeekResult.rows[0]?.avg_hr || '0');
  const lastWeekAvgPace = lastWeekAvgSpeed > 0 ? 1000 / (lastWeekAvgSpeed * 60) : 0;

  // Calculate changes
  const avgPaceChange = lastWeekAvgPace > 0 ? ((thisWeekAvgPace - lastWeekAvgPace) / lastWeekAvgPace * 100) : 0;
  const avgHRChange = thisWeekAvgHR - lastWeekAvgHR;

  // Determine trends
  let pacingTrend: 'improving' | 'stable' | 'declining';
  if (avgPaceChange < -3) pacingTrend = 'improving'; // Faster pace
  else if (avgPaceChange > 3) pacingTrend = 'declining'; // Slower pace
  else pacingTrend = 'stable';

  let hrTrend: 'improving' | 'stable' | 'elevated';
  if (avgHRChange > 3) hrTrend = 'elevated'; // Higher HR
  else if (avgHRChange < -3) hrTrend = 'improving'; // Lower HR
  else hrTrend = 'stable';

  // Consistency change (simplified - could be enhanced with variance analysis)
  const consistencyChange: 'more_consistent' | 'stable' | 'less_consistent' = 'stable';

  return {
    pacingTrend,
    avgPaceChange: Math.round(avgPaceChange * 10) / 10,
    hrTrend,
    avgHRChange: Math.round(avgHRChange),
    consistencyChange
  };
}

/**
 * Analyze training load distribution
 */
async function analyzeTrainingLoad(
  userId: number,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyInsight['trainingLoad']> {
  // Get activities with HR zone data
  const activitiesResult = await pool.query(
    `SELECT
       a.id,
       a.distance,
       hz.zone_1_seconds,
       hz.zone_2_seconds,
       hz.zone_3_seconds,
       hz.zone_4_seconds,
       hz.zone_5_seconds
     FROM activities a
     LEFT JOIN activity_hr_zones hz ON a.id = hz.activity_id
     WHERE a.user_id = $1
       AND a.start_date >= $2
       AND a.start_date < $3`,
    [userId, weekStart, weekEnd]
  );

  let totalDistance = 0;
  let easyDistance = 0; // Zone 1-2
  let moderateDistance = 0; // Zone 3
  let hardDistance = 0; // Zone 4-5
  let hardWorkoutsCompleted = 0;

  for (const activity of activitiesResult.rows) {
    const distance = parseFloat(activity.distance || '0') / 1000;
    totalDistance += distance;

    // Calculate predominant zone
    const zones = [
      parseInt(activity.zone_1_seconds || '0'),
      parseInt(activity.zone_2_seconds || '0'),
      parseInt(activity.zone_3_seconds || '0'),
      parseInt(activity.zone_4_seconds || '0'),
      parseInt(activity.zone_5_seconds || '0')
    ];

    const totalSeconds = zones.reduce((sum, z) => sum + z, 0);
    if (totalSeconds > 0) {
      const zone1_2 = zones[0] + zones[1];
      const zone3 = zones[2];
      const zone4_5 = zones[3] + zones[4];

      if (zone1_2 > zone3 && zone1_2 > zone4_5) {
        easyDistance += distance;
      } else if (zone3 > zone4_5) {
        moderateDistance += distance;
      } else {
        hardDistance += distance;
        hardWorkoutsCompleted++;
      }
    } else {
      // No HR data - assume easy
      easyDistance += distance;
    }
  }

  // Calculate percentages
  const easyPercent = totalDistance > 0 ? (easyDistance / totalDistance * 100) : 0;
  const moderatePercent = totalDistance > 0 ? (moderateDistance / totalDistance * 100) : 0;
  const hardPercent = totalDistance > 0 ? (hardDistance / totalDistance * 100) : 0;

  // Recovery days analysis
  const totalDays = activitiesResult.rows.length;
  const recoveryDaysActual = 7 - totalDays;

  // Recommend 1-2 rest days per week
  let recoveryDaysNeeded = 1;
  if (hardWorkoutsCompleted >= 2) recoveryDaysNeeded = 2;

  return {
    intensityDistribution: {
      easy: Math.round(easyPercent),
      moderate: Math.round(moderatePercent),
      hard: Math.round(hardPercent)
    },
    hardWorkoutsCompleted,
    recoveryDaysActual,
    recoveryDaysNeeded
  };
}

/**
 * Assess weekly risks
 */
function assessWeeklyRisks(
  volume: WeeklyInsight['volume'],
  adherence: WeeklyInsight['adherence'],
  patterns: WeeklyInsight['patterns'],
  trainingLoad: WeeklyInsight['trainingLoad']
): WeeklyInsight['weeklyRisks'] {
  const indicators: string[] = [];
  let overtrainingRisk: 'low' | 'moderate' | 'high' = 'low';
  let injuryRisk: 'low' | 'moderate' | 'high' = 'low';
  let burnoutRisk: 'low' | 'moderate' | 'high' = 'low';

  // Volume risk
  if (volume.volumeRisk === 'danger') {
    indicators.push(`Volume increased ${volume.weekOverWeekChange.toFixed(0)}% (exceeds 10% guideline)`);
    injuryRisk = 'high';
    overtrainingRisk = 'moderate';
  } else if (volume.volumeRisk === 'caution') {
    indicators.push(`Volume increased ${volume.weekOverWeekChange.toFixed(0)}% (approaching limit)`);
    injuryRisk = 'moderate';
  }

  // HR elevation
  if (patterns.hrTrend === 'elevated') {
    indicators.push(`Average HR elevated by ${patterns.avgHRChange} bpm`);
    overtrainingRisk = overtrainingRisk === 'low' ? 'moderate' : 'high';
  }

  // Pacing decline
  if (patterns.pacingTrend === 'declining') {
    indicators.push(`Average pace slowing (${patterns.avgPaceChange.toFixed(1)}% slower)`);
    if (overtrainingRisk === 'moderate') overtrainingRisk = 'high';
  }

  // Insufficient recovery
  if (trainingLoad.recoveryDaysActual < trainingLoad.recoveryDaysNeeded) {
    indicators.push(`Only ${trainingLoad.recoveryDaysActual} recovery days (need ${trainingLoad.recoveryDaysNeeded})`);
    overtrainingRisk = overtrainingRisk === 'low' ? 'moderate' : 'high';
  }

  // High intensity percentage
  if (trainingLoad.intensityDistribution.hard > 25) {
    indicators.push(`${trainingLoad.intensityDistribution.hard}% of volume at high intensity (>25% is risky)`);
    injuryRisk = injuryRisk === 'low' ? 'moderate' : 'high';
  }

  // Low adherence
  if (adherence.adherenceRate < 70) {
    indicators.push(`Low adherence: ${adherence.adherenceRate}% completion rate`);
    burnoutRisk = 'moderate';
  }

  return {
    overtrainingRisk,
    injuryRisk,
    burnoutRisk,
    indicators
  };
}

/**
 * Generate next week guidance
 */
function generateNextWeekGuidance(
  volume: WeeklyInsight['volume'],
  adherence: WeeklyInsight['adherence'],
  risks: WeeklyInsight['weeklyRisks'],
  trainingLoad: WeeklyInsight['trainingLoad']
): WeeklyInsight['nextWeekGuidance'] {
  const focusAreas: string[] = [];
  let volumeRecommendation: string;

  // Volume recommendation
  if (risks.overtrainingRisk === 'high' || risks.injuryRisk === 'high') {
    const reducedVolume = Math.max(volume.totalDistance * 0.85, 30);
    volumeRecommendation = `Reduce to ${reducedVolume.toFixed(0)}-${(reducedVolume + 5).toFixed(0)}km (recovery week)`;
    focusAreas.push('Recovery and regeneration');
  } else if (volume.volumeRisk === 'danger') {
    volumeRecommendation = `Hold at ${volume.totalDistance.toFixed(0)}-${(volume.totalDistance + 3).toFixed(0)}km (no increase)`;
    focusAreas.push('Consolidate current volume');
  } else {
    const increasedVolume = volume.totalDistance * 1.08;
    volumeRecommendation = `Increase to ${increasedVolume.toFixed(0)}-${(increasedVolume + 3).toFixed(0)}km (8% progression)`;
  }

  // Focus areas based on risks and patterns
  if (trainingLoad.intensityDistribution.easy < 70) {
    focusAreas.push('More easy-paced volume (aim for 80% Z1-Z2)');
  }

  if (adherence.adherenceRate < 80) {
    focusAreas.push('Consistency and adherence');
  }

  if (trainingLoad.recoveryDaysActual < trainingLoad.recoveryDaysNeeded) {
    focusAreas.push('Proper recovery days');
  }

  // Workout adjustments (placeholder - would be populated with specific workout IDs in production)
  const workoutsToAdjust: Array<{
    workoutId: number;
    currentDate: Date;
    recommendation: string;
  }> = [];

  return {
    volumeRecommendation,
    focusAreas,
    workoutsToAdjust
  };
}

/**
 * Store weekly insight in database
 */
async function storeWeeklyInsight(insight: WeeklyInsight): Promise<void> {
  await pool.query(
    `INSERT INTO weekly_insights
     (user_id, week_start, week_end, volume_analysis, adherence_tracking,
      pattern_changes, training_load, weekly_risks, next_week_guidance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, week_start)
     DO UPDATE SET
       volume_analysis = EXCLUDED.volume_analysis,
       adherence_tracking = EXCLUDED.adherence_tracking,
       pattern_changes = EXCLUDED.pattern_changes,
       training_load = EXCLUDED.training_load,
       weekly_risks = EXCLUDED.weekly_risks,
       next_week_guidance = EXCLUDED.next_week_guidance`,
    [
      insight.userId,
      insight.weekStart,
      insight.weekEnd,
      JSON.stringify(insight.volume),
      JSON.stringify(insight.adherence),
      JSON.stringify(insight.patterns),
      JSON.stringify(insight.trainingLoad),
      JSON.stringify(insight.weeklyRisks),
      JSON.stringify(insight.nextWeekGuidance)
    ]
  );
}

/**
 * Batch compute weekly insights for all active users
 *
 * Should be called via cron job every Sunday evening
 */
export async function batchComputeWeeklyInsights(): Promise<void> {
  console.log('🔄 Starting batch weekly insight computation...');

  try {
    // Get all users with recent activity (active in last 14 days)
    const result = await pool.query(
      `SELECT DISTINCT user_id
       FROM activities
       WHERE start_date >= CURRENT_DATE - INTERVAL '14 days'`
    );

    const activeUsers = result.rows.map(row => row.user_id);
    console.log(`Found ${activeUsers.length} active users`);

    // Calculate last week's date range (Monday to Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + daysToSunday);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    console.log(`Computing insights for week: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`);

    // Compute insights for each user
    for (const userId of activeUsers) {
      try {
        await computeWeeklyInsight(userId, weekStart, weekEnd);
      } catch (error) {
        console.error(`Failed to compute weekly insight for user ${userId}:`, error);
        // Continue with other users
      }
    }

    console.log('✓ Batch weekly insight computation completed');

  } catch (error) {
    console.error('Error in batch weekly insight computation:', error);
    throw error;
  }
}
