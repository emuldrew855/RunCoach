import { getStravaActivities, getActivityStreams } from './stravaService';
import { upsertActivity } from '../models/Activity';
import { calculateAndStoreHRZones, estimateAndStoreHRZones } from '../models/ActivityHRZone';
import { extractActivityPatterns, generatePatternEmbeddings } from './activityPatternService';
import { computeDailyInsight } from './dailyInsightService';
import { getUserById, updateUser } from '../models/User';
import pool from '../config/database';

export async function syncActivities(userId: number): Promise<number> {
  let page = 1;
  let newActivities = 0;
  let hasMore = true;
  let mostRecentActivityDate: Date | null = null;

  // Get user's last sync timestamp for incremental sync
  const user = await getUserById(userId);
  let afterTimestamp: number | undefined;

  if (user?.last_activity_sync_at) {
    // Convert to Unix timestamp (seconds since epoch)
    afterTimestamp = Math.floor(new Date(user.last_activity_sync_at).getTime() / 1000);
    console.log(`📅 Incremental sync: fetching activities after ${user.last_activity_sync_at}`);
  } else {
    console.log(`📅 Full sync: fetching all activities (first sync for user)`);
  }

  while (hasMore) {
    const activities = await getStravaActivities(userId, afterTimestamp, page, 100);

    if (activities.length === 0) {
      hasMore = false;
      break;
    }

    // Filter for runs only
    const runs = activities.filter((a: any) =>
      ['Run', 'TrailRun', 'VirtualRun'].includes(a.type)
    );

    // Insert activities into database and calculate HR zones
    for (const activity of runs) {
      const dbActivity = await upsertActivity(userId, activity);
      newActivities++;

      // Track the most recent activity date for incremental sync
      const activityDate = new Date(activity.start_date);
      if (!mostRecentActivityDate || activityDate > mostRecentActivityDate) {
        mostRecentActivityDate = activityDate;
      }

      // Calculate HR zones if activity has heart rate data
      if (activity.average_heartrate && activity.average_heartrate > 0) {
        try {
          // Fetch detailed HR stream data from Strava
          const streams = await getActivityStreams(userId, activity.id, ['time', 'heartrate']);

          // If we got stream data, calculate zones from it
          if (streams.heartrate && streams.time) {
            await calculateAndStoreHRZones(dbActivity.id, userId, {
              timestamps: streams.time.data,
              heartrates: streams.heartrate.data,
            });
            console.log(`✅ Calculated HR zones for activity ${dbActivity.id}`);
          } else {
            // Fallback: estimate HR zones from average HR when streams not available
            await estimateAndStoreHRZones(
              dbActivity.id,
              userId,
              activity.average_heartrate,
              activity.moving_time
            );
            console.log(`✅ Estimated HR zones for activity ${dbActivity.id} (no stream data)`);
          }
        } catch (error) {
          // Final fallback: estimate HR zones even if stream fetch fails
          try {
            await estimateAndStoreHRZones(
              dbActivity.id,
              userId,
              activity.average_heartrate,
              activity.moving_time
            );
            console.log(`✅ Estimated HR zones for activity ${dbActivity.id} (stream fetch failed)`);
          } catch (fallbackError) {
            console.warn(`⚠️ Failed to calculate HR zones for activity ${activity.id}:`, error);
          }
        }
      }

      // Extract activity patterns (Phase 3: RAG + Vector Search)
      try {
        const patterns = await extractActivityPatterns(userId, dbActivity.id, activity);

        // Store patterns in activities table
        await pool.query(
          `UPDATE activities
           SET extracted_patterns = $1
           WHERE id = $2`,
          [patterns, dbActivity.id]
        );

        // Generate pattern embeddings for semantic search
        await generatePatternEmbeddings(userId, dbActivity.id, patterns);

        console.log(`✅ Extracted patterns for activity ${dbActivity.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to extract patterns for activity ${activity.id}:`, error);
        // Continue with sync even if pattern extraction fails
      }

      // Auto-link activity to planned workout if not already linked
      let plannedWorkout = null;
      try {
        // First check if already linked
        const existingLinkResult = await pool.query(
          `SELECT pw.* FROM planned_workouts pw
           WHERE pw.completed_activity_id = $1
           LIMIT 1`,
          [dbActivity.id]
        );

        if (existingLinkResult.rows[0]) {
          plannedWorkout = existingLinkResult.rows[0];
          console.log(`📋 Activity ${dbActivity.id} already linked to workout: ${plannedWorkout.name}`);
        } else {
          // Try to auto-link by date matching
          // IMPORTANT: Use start_date_local to match the calendar date the user ran on
          // Using start_date (UTC) can shift the date when activities happen late in the day
          const localDateStr = activity.start_date_local
            ? activity.start_date_local.split('T')[0]  // Already local, just extract date
            : new Date(activity.start_date).toISOString().split('T')[0]; // Fallback to UTC
          const dateStr = localDateStr; // YYYY-MM-DD in user's local timezone

          const dateMatchResult = await pool.query(
            `SELECT pw.* FROM planned_workouts pw
             JOIN training_plans tp ON pw.training_plan_id = tp.id
             WHERE tp.user_id = $1
               AND tp.is_active = true
               AND pw.scheduled_date = $2::date
               AND pw.completed_activity_id IS NULL
               AND pw.completion_status = 'pending'
             ORDER BY
               -- Prefer workouts with similar distance (within 30%)
               CASE
                 WHEN pw.target_distance_meters IS NOT NULL
                   AND ABS(pw.target_distance_meters - $3) / NULLIF(pw.target_distance_meters, 0) < 0.3
                 THEN 0
                 ELSE 1
               END,
               pw.id ASC
             LIMIT 1`,
            [userId, dateStr, activity.distance]
          );

          if (dateMatchResult.rows[0]) {
            plannedWorkout = dateMatchResult.rows[0];

            // Auto-link the activity to the workout
            await pool.query(
              `UPDATE planned_workouts
               SET completed_activity_id = $1,
                   completion_status = 'completed',
                   completed_at = $2
               WHERE id = $3`,
              [dbActivity.id, activityDate, plannedWorkout.id]
            );

            console.log(`📋 Auto-linked activity ${dbActivity.id} to workout: ${plannedWorkout.name} (date match)`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to auto-link activity ${activity.id}:`, error);
      }

      // Compute daily insights (structured analytics for coaching)
      try {
        await computeDailyInsight(userId, dbActivity.id, activity, plannedWorkout);
        console.log(`✅ Computed daily insight for activity ${dbActivity.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to compute daily insight for activity ${activity.id}:`, error);
        // Continue with sync even if insight computation fails
      }
    }

    if (activities.length < 100) {
      hasMore = false;
    }

    page++;
  }

  // Update last sync timestamp if we processed any activities
  if (mostRecentActivityDate) {
    await updateUser(userId, { last_activity_sync_at: mostRecentActivityDate });
    console.log(`✅ Updated last activity sync timestamp to ${mostRecentActivityDate.toISOString()}`);
  }

  console.log(`✅ Activity sync completed: ${newActivities} activities processed`);
  return newActivities;
}

/**
 * Re-link activities to planned workouts using the correct local date.
 * This repairs data that may have been incorrectly linked due to timezone issues.
 */
export async function relinkActivitiesToWorkouts(userId: number): Promise<{
  relinked: number;
  alreadyCorrect: number;
  unmatched: number;
}> {
  console.log(`🔧 Starting activity re-link repair for user ${userId}`);

  // Get all activities for this user from the last 90 days
  const activitiesResult = await pool.query(
    `SELECT id, start_date, start_date_local, distance_meters
     FROM activities
     WHERE user_id = $1
       AND start_date >= NOW() - INTERVAL '90 days'
     ORDER BY start_date DESC`,
    [userId]
  );

  let relinked = 0;
  let alreadyCorrect = 0;
  let unmatched = 0;

  for (const activity of activitiesResult.rows) {
    // Use local date for matching (the fix)
    const localDateStr = activity.start_date_local
      ? new Date(activity.start_date_local).toISOString().split('T')[0]
      : new Date(activity.start_date).toISOString().split('T')[0];

    // Check if already correctly linked
    const existingLinkResult = await pool.query(
      `SELECT pw.id, pw.scheduled_date::text as scheduled_date
       FROM planned_workouts pw
       WHERE pw.completed_activity_id = $1`,
      [activity.id]
    );

    if (existingLinkResult.rows[0]) {
      const linkedWorkoutDate = existingLinkResult.rows[0].scheduled_date.split('T')[0];
      if (linkedWorkoutDate === localDateStr) {
        alreadyCorrect++;
        continue; // Already correctly linked
      }

      // Unlink the incorrectly linked workout
      await pool.query(
        `UPDATE planned_workouts
         SET completed_activity_id = NULL,
             completion_status = 'pending',
             completed_at = NULL
         WHERE id = $1`,
        [existingLinkResult.rows[0].id]
      );
      console.log(`🔗 Unlinked activity ${activity.id} from workout on wrong date (${linkedWorkoutDate} != ${localDateStr})`);
    }

    // Find the correct workout to link to
    const correctWorkoutResult = await pool.query(
      `SELECT pw.id, pw.name FROM planned_workouts pw
       JOIN training_plans tp ON pw.training_plan_id = tp.id
       WHERE tp.user_id = $1
         AND tp.is_active = true
         AND pw.scheduled_date = $2::date
         AND pw.completed_activity_id IS NULL
         AND pw.completion_status = 'pending'
       ORDER BY
         CASE
           WHEN pw.target_distance_meters IS NOT NULL
             AND ABS(pw.target_distance_meters - $3) / NULLIF(pw.target_distance_meters, 0) < 0.3
           THEN 0
           ELSE 1
         END,
         pw.id ASC
       LIMIT 1`,
      [userId, localDateStr, activity.distance_meters]
    );

    if (correctWorkoutResult.rows[0]) {
      // Link to the correct workout
      await pool.query(
        `UPDATE planned_workouts
         SET completed_activity_id = $1,
             completion_status = 'completed',
             completed_at = $2
         WHERE id = $3`,
        [activity.id, activity.start_date, correctWorkoutResult.rows[0].id]
      );
      relinked++;
      console.log(`✅ Relinked activity ${activity.id} to workout "${correctWorkoutResult.rows[0].name}" on ${localDateStr}`);
    } else {
      unmatched++;
    }
  }

  console.log(`🔧 Re-link repair complete: ${relinked} relinked, ${alreadyCorrect} already correct, ${unmatched} unmatched`);
  return { relinked, alreadyCorrect, unmatched };
}
