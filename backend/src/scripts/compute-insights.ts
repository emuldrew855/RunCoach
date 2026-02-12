/**
 * Test Script: Compute Daily Insights for Existing Activities
 *
 * Run this to retroactively compute insights for existing activities
 * Usage: npx ts-node src/scripts/compute-insights.ts [user_id]
 */

import pool from '../config/database';
import { computeDailyInsight } from '../services/dailyInsightService';

async function computeInsightsForUser(userId: number) {
  console.log(`\n🔍 Computing insights for user ${userId}...\n`);

  try {
    // Get recent activities (last 30 days)
    const result = await pool.query(
      `SELECT
         a.*,
         pw.id as planned_workout_id,
         pw.target_distance_meters,
         pw.target_pace_avg,
         pw.target_hr_zone
       FROM activities a
       LEFT JOIN planned_workouts pw ON a.id = pw.completed_activity_id
       WHERE a.user_id = $1
         AND a.start_date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY a.start_date DESC
       LIMIT 10`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.log('⚠️  No recent activities found for this user.');
      return;
    }

    console.log(`Found ${result.rows.length} recent activities\n`);

    for (const activity of result.rows) {
      console.log(`Processing activity ${activity.id}: ${activity.name} (${new Date(activity.start_date).toLocaleDateString()})`);

      // Build planned workout object if exists
      const plannedWorkout = activity.planned_workout_id
        ? {
            id: activity.planned_workout_id,
            target_distance_meters: activity.target_distance_meters,
            target_pace_avg: activity.target_pace_avg,
            target_hr_zone: activity.target_hr_zone
          }
        : undefined;

      try {
        await computeDailyInsight(
          userId,
          activity.id,
          {
            ...activity,
            distance: activity.distance,
            start_date: activity.start_date,
            average_speed: activity.average_speed,
            average_heartrate: activity.average_heartrate,
            max_heartrate: activity.max_heartrate,
            splits_metric: activity.splits_metric
          },
          plannedWorkout
        );

        console.log(`  ✓ Insight computed successfully\n`);
      } catch (error) {
        console.error(`  ✗ Failed to compute insight:`, error);
      }
    }

    console.log('\n✅ Insight computation completed!');
    console.log('\nTo verify, run:');
    console.log(`  SELECT * FROM daily_run_insights WHERE user_id = ${userId} ORDER BY run_date DESC LIMIT 5;\n`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

// Get user ID from command line or use default
const userId = parseInt(process.argv[2]) || 1;

computeInsightsForUser(userId);
