/**
 * Backfill Script: Extract Patterns from Existing Activities
 *
 * This script processes all existing activities to extract pacing, HR, cadence,
 * and elevation patterns. It's safe to run multiple times (skips already processed).
 *
 * Usage:
 *   npm run backfill:patterns
 *   or
 *   ts-node src/scripts/backfillActivityPatterns.ts
 */

import pool from '../config/database';
import { extractActivityPatterns, generatePatternEmbeddings } from '../services/activityPatternService';

interface ActivityRow {
  id: number;
  user_id: number;
  strava_activity_id: number;
  name: string;
  distance_meters: number;
  moving_time_seconds: number;
  average_speed: number;
  average_heartrate: number;
  max_heartrate: number;
  average_cadence: number;
  total_elevation_gain_meters: number;
  splits_metric: any;
  start_date: Date;
}

async function backfillActivityPatterns() {
  console.log('🏃 Starting activity pattern backfill...\n');

  try {
    // Get all activities without extracted patterns
    const result = await pool.query<ActivityRow>(
      `SELECT id, user_id, strava_activity_id, name, distance_meters, moving_time_seconds,
              average_speed, average_heartrate, max_heartrate, average_cadence,
              total_elevation_gain_meters, splits_metric, start_date
       FROM activities
       WHERE (extracted_patterns IS NULL OR extracted_patterns = '{}')
         AND splits_metric IS NOT NULL
       ORDER BY start_date DESC`
    );

    const activities = result.rows;
    console.log(`📊 Found ${activities.length} activities to process\n`);

    if (activities.length === 0) {
      console.log('✓ No activities need pattern extraction');
      await pool.end();
      return;
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const activity of activities) {
      try {
        console.log(`Processing activity ${activity.id} (${activity.name || 'Unnamed'})...`);

        // Check if activity has sufficient data
        if (!activity.splits_metric || !Array.isArray(activity.splits_metric)) {
          console.log(`  ⚠️ Skipped - no splits data`);
          skipped++;
          continue;
        }

        // Extract patterns
        const patterns = await extractActivityPatterns(activity.user_id, activity.id, activity);

        // Store patterns in activities table
        await pool.query(
          `UPDATE activities
           SET extracted_patterns = $1
           WHERE id = $2`,
          [patterns, activity.id]
        );

        // Generate pattern embeddings for semantic search
        await generatePatternEmbeddings(activity.user_id, activity.id, patterns);

        console.log(`  ✓ Processed successfully`);
        processed++;
      } catch (error) {
        console.error(`  ✗ Failed to process activity ${activity.id}:`, error);
        failed++;
      }
    }

    console.log(`\n✅ Activity pattern backfill complete!`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${activities.length}`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the backfill
backfillActivityPatterns().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
