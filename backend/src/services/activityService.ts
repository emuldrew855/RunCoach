import { getStravaActivities, getActivityStreams } from './stravaService';
import { upsertActivity } from '../models/Activity';
import { calculateAndStoreHRZones } from '../models/ActivityHRZone';
import { extractActivityPatterns, generatePatternEmbeddings } from './activityPatternService';
import { computeDailyInsight } from './dailyInsightService';

export async function syncActivities(userId: number): Promise<number> {
  let page = 1;
  let newActivities = 0;
  let hasMore = true;

  while (hasMore) {
    const activities = await getStravaActivities(userId, undefined, page, 100);

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
          }
        } catch (error) {
          console.warn(`⚠️ Failed to calculate HR zones for activity ${activity.id}:`, error);
          // Continue with sync even if HR zone calculation fails
        }
      }

      // Extract activity patterns (Phase 3: RAG + Vector Search)
      try {
        const patterns = await extractActivityPatterns(userId, dbActivity.id, activity);

        // Store patterns in activities table
        await import('../config/database').then(({ pool }) =>
          pool.query(
            `UPDATE activities
             SET extracted_patterns = $1
             WHERE id = $2`,
            [patterns, dbActivity.id]
          )
        );

        // Generate pattern embeddings for semantic search
        await generatePatternEmbeddings(userId, dbActivity.id, patterns);

        console.log(`✅ Extracted patterns for activity ${dbActivity.id}`);
      } catch (error) {
        console.warn(`⚠️ Failed to extract patterns for activity ${activity.id}:`, error);
        // Continue with sync even if pattern extraction fails
      }

      // Compute daily insights (structured analytics for coaching)
      try {
        // Get planned workout if this activity was part of a training plan
        const pool = (await import('../config/database')).pool;
        const plannedWorkoutResult = await pool.query(
          `SELECT pw.* FROM planned_workouts pw
           WHERE pw.user_id = $1
             AND pw.completed_activity_id = $2
           LIMIT 1`,
          [userId, dbActivity.id]
        );

        const plannedWorkout = plannedWorkoutResult.rows[0] || null;

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

  return newActivities;
}
