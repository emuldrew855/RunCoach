/**
 * Backfill Script: Process All Existing Data for Long-Term Memory
 *
 * This script runs a complete backfill:
 * 1. Process conversations → summaries, insights, embeddings
 * 2. Extract activity patterns → pacing, HR, cadence, elevation
 * 3. Consolidate memories → deduplicate, merge, prune
 *
 * Usage:
 *   npm run backfill:all
 *   or
 *   ts-node src/scripts/backfillAllMemories.ts
 */

import pool from '../config/database';
import { processConversation } from '../services/conversationSummarizationService';
import { extractActivityPatterns, generatePatternEmbeddings } from '../services/activityPatternService';
import { consolidateAllUsers } from '../services/memoryConsolidationService';

interface ConversationRow {
  id: string;
  user_id: number;
  message_count: number;
}

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

async function backfillConversations() {
  console.log('💬 Step 1/3: Processing conversations...\n');

  // Fetch all conversations with at least 2 messages
  const result = await pool.query<ConversationRow>(
    `SELECT
        c.id,
        c.user_id,
        COUNT(m.id) as message_count
     FROM conversations c
     LEFT JOIN chat_messages m ON c.id = m.conversation_id
     WHERE c.id::text NOT IN (SELECT DISTINCT conversation_id FROM conversation_summaries)
     GROUP BY c.id, c.user_id
     HAVING COUNT(m.id) >= 2
     ORDER BY c.created_at DESC`
  );

  const conversations = result.rows;
  console.log(`  Found ${conversations.length} conversations to process\n`);

  if (conversations.length === 0) {
    console.log('  ✓ No conversations need processing');
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const conversation of conversations) {
    try {
      console.log(`  Processing conversation ${conversation.id} (${conversation.message_count} messages)...`);

      await processConversation(conversation.user_id, conversation.id);

      console.log(`    ✓ Processed successfully`);
      processed++;
    } catch (error) {
      console.error(`    ✗ Failed:`, error);
      failed++;
    }
  }

  console.log(`\n  ✅ Conversation processing complete: ${processed} succeeded, ${failed} failed\n`);
}

async function backfillActivityPatterns() {
  console.log('🏃 Step 2/3: Extracting activity patterns...\n');

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
  console.log(`  Found ${activities.length} activities to process\n`);

  if (activities.length === 0) {
    console.log('  ✓ No activities need pattern extraction');
    return;
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const activity of activities) {
    try {
      console.log(`  Processing activity ${activity.id} (${activity.name || 'Unnamed'})...`);

      // Check if activity has sufficient data
      if (!activity.splits_metric || !Array.isArray(activity.splits_metric)) {
        console.log(`    ⚠️ Skipped - no splits data`);
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

      // Generate pattern embeddings
      await generatePatternEmbeddings(activity.user_id, activity.id, patterns);

      console.log(`    ✓ Processed successfully`);
      processed++;
    } catch (error) {
      console.error(`    ✗ Failed:`, error);
      failed++;
    }
  }

  console.log(`\n  ✅ Activity pattern extraction complete: ${processed} succeeded, ${failed} failed, ${skipped} skipped\n`);
}

async function consolidateMemories() {
  console.log('🧹 Step 3/3: Consolidating memories...\n');

  try {
    await consolidateAllUsers();
    console.log(`\n  ✅ Memory consolidation complete\n`);
  } catch (error) {
    console.error(`  ❌ Consolidation failed:`, error);
  }
}

async function backfillAll() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🧠 Complete Memory Backfill - Phase 3: RAG + Vector   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // Step 1: Process conversations
    await backfillConversations();

    // Step 2: Extract activity patterns
    await backfillActivityPatterns();

    // Step 3: Consolidate memories
    await consolidateMemories();

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  ✅ BACKFILL COMPLETE                    ║');
    console.log(`║              Completed in ${duration} seconds                    ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ Backfill failed with error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the complete backfill
backfillAll().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
