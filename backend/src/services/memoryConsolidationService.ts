/**
 * Memory Consolidation Service
 *
 * Keeps the memory database clean and efficient by:
 * 1. Deduplicating similar insights (95%+ similarity)
 * 2. Merging similar activity patterns
 * 3. Pruning stale or low-value memories
 *
 * Run periodically (nightly) to maintain memory quality.
 */

import pool from '../config/database';

export interface ConsolidationConfig {
  similarity_threshold: number; // 0.95+ = very similar
  merge_window_days: number; // Only consolidate recent memories
  stale_months: number; // Prune memories older than this with low occurrence
  min_occurrence: number; // Min occurrence to keep stale memories
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  similarity_threshold: 0.95,
  merge_window_days: 30,
  stale_months: 6,
  min_occurrence: 2,
};

export interface ConsolidationResult {
  merged: number;
  removed: number;
  kept: number;
}

/**
 * Find and merge duplicate insights
 */
export async function consolidateInsights(
  userId: number,
  config: ConsolidationConfig = DEFAULT_CONFIG
): Promise<ConsolidationResult> {
  console.log(`🧹 Starting insight consolidation for user ${userId}...`);

  // Get recent insights of the same type
  const result = await pool.query(
    `SELECT id, insight_text, insight_type, embedding, created_at
     FROM workout_insights
     WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '${config.merge_window_days} days'
     ORDER BY created_at DESC`,
    [userId]
  );

  const insights = result.rows;
  const toMerge: Map<number, number[]> = new Map(); // keep_id -> [remove_ids]
  const processed = new Set<number>();

  console.log(`  Found ${insights.length} recent insights to check`);

  // Find similar insights using pgvector
  for (let i = 0; i < insights.length; i++) {
    if (processed.has(insights[i].id)) continue;

    const similarIds: number[] = [];

    for (let j = i + 1; j < insights.length; j++) {
      if (processed.has(insights[j].id)) continue;
      if (insights[i].insight_type !== insights[j].insight_type) continue;

      // Calculate similarity using pgvector
      const similarityResult = await pool.query(
        `SELECT 1 - (
           (SELECT embedding FROM workout_insights WHERE id = $1) <=>
           (SELECT embedding FROM workout_insights WHERE id = $2)
         ) as similarity`,
        [insights[i].id, insights[j].id]
      );

      const similarity = parseFloat(similarityResult.rows[0].similarity);

      if (similarity >= config.similarity_threshold) {
        similarIds.push(insights[j].id);
        processed.add(insights[j].id);
      }
    }

    if (similarIds.length > 0) {
      toMerge.set(insights[i].id, similarIds);
      processed.add(insights[i].id);
    }
  }

  // Merge similar insights
  let merged = 0;
  for (const [keepId, removeIds] of toMerge.entries()) {
    // Increment occurrence count on kept insight
    await pool.query(
      `UPDATE workout_insights
       SET occurrence_count = occurrence_count + $2,
           metadata = jsonb_set(
             metadata,
             '{merged_from}',
             to_jsonb(COALESCE((metadata->'merged_from')::int[], ARRAY[]::int[]) || $3)
           )
       WHERE id = $1`,
      [keepId, removeIds.length, removeIds]
    );

    // Delete duplicates
    await pool.query(
      `DELETE FROM workout_insights WHERE id = ANY($1)`,
      [removeIds]
    );

    merged += removeIds.length;
  }

  console.log(`✓ Consolidated ${merged} duplicate insights (kept ${toMerge.size} unique)`);

  return {
    merged,
    removed: merged,
    kept: insights.length - merged,
  };
}

/**
 * Merge similar activity patterns
 */
export async function consolidatePatterns(
  userId: number,
  config: ConsolidationConfig = DEFAULT_CONFIG
): Promise<ConsolidationResult> {
  console.log(`🧹 Starting pattern consolidation for user ${userId}...`);

  // Get recent patterns by category
  const result = await pool.query(
    `SELECT id, pattern_text, pattern_category, embedding, occurrence_count, last_seen
     FROM activity_patterns
     WHERE user_id = $1
       AND last_seen > NOW() - INTERVAL '${config.merge_window_days} days'
     ORDER BY pattern_category, last_seen DESC`,
    [userId]
  );

  const patterns = result.rows;
  const toMerge: Map<number, number[]> = new Map();
  const processed = new Set<number>();

  console.log(`  Found ${patterns.length} recent patterns to check`);

  // Find similar patterns within same category
  for (let i = 0; i < patterns.length; i++) {
    if (processed.has(patterns[i].id)) continue;

    const similarIds: number[] = [];

    for (let j = i + 1; j < patterns.length; j++) {
      if (processed.has(patterns[j].id)) continue;
      if (patterns[i].pattern_category !== patterns[j].pattern_category) continue;

      // Calculate similarity
      const similarityResult = await pool.query(
        `SELECT 1 - (
           (SELECT embedding FROM activity_patterns WHERE id = $1) <=>
           (SELECT embedding FROM activity_patterns WHERE id = $2)
         ) as similarity`,
        [patterns[i].id, patterns[j].id]
      );

      const similarity = parseFloat(similarityResult.rows[0].similarity);

      if (similarity >= config.similarity_threshold) {
        similarIds.push(patterns[j].id);
        processed.add(patterns[j].id);
      }
    }

    if (similarIds.length > 0) {
      toMerge.set(patterns[i].id, similarIds);
      processed.add(patterns[i].id);
    }
  }

  // Merge similar patterns
  let merged = 0;
  for (const [keepId, removeIds] of toMerge.entries()) {
    // Get occurrence counts to sum
    const occurrencesResult = await pool.query(
      `SELECT SUM(occurrence_count) as total_occurrences
       FROM activity_patterns
       WHERE id = ANY($1)`,
      [removeIds]
    );

    const additionalOccurrences = parseInt(occurrencesResult.rows[0].total_occurrences) || 0;

    // Update kept pattern
    await pool.query(
      `UPDATE activity_patterns
       SET occurrence_count = occurrence_count + $2,
           last_seen = GREATEST(last_seen, (SELECT MAX(last_seen) FROM activity_patterns WHERE id = ANY($3))),
           metadata = jsonb_set(
             metadata,
             '{merged_from}',
             to_jsonb(COALESCE((metadata->'merged_from')::int[], ARRAY[]::int[]) || $3)
           )
       WHERE id = $1`,
      [keepId, additionalOccurrences, removeIds]
    );

    // Delete duplicates
    await pool.query(
      `DELETE FROM activity_patterns WHERE id = ANY($1)`,
      [removeIds]
    );

    merged += removeIds.length;
  }

  console.log(`✓ Consolidated ${merged} duplicate patterns (kept ${toMerge.size} unique)`);

  return {
    merged,
    removed: merged,
    kept: patterns.length - merged,
  };
}

/**
 * Remove stale or low-value memories
 */
export async function pruneStaleMemories(
  userId: number,
  config: ConsolidationConfig = DEFAULT_CONFIG
): Promise<ConsolidationResult> {
  console.log(`🗑️  Pruning stale memories for user ${userId}...`);

  // Remove old insights with low occurrence
  const insightsResult = await pool.query(
    `DELETE FROM workout_insights
     WHERE user_id = $1
       AND created_at < NOW() - INTERVAL '${config.stale_months} months'
       AND occurrence_count < $2
     RETURNING id`,
    [userId, config.min_occurrence]
  );

  const insightsRemoved = insightsResult.rowCount || 0;

  // Remove old patterns with low occurrence
  const patternsResult = await pool.query(
    `DELETE FROM activity_patterns
     WHERE user_id = $1
       AND first_seen < NOW() - INTERVAL '${config.stale_months} months'
       AND occurrence_count < $2
     RETURNING id`,
    [userId, config.min_occurrence]
  );

  const patternsRemoved = patternsResult.rowCount || 0;

  const totalRemoved = insightsRemoved + patternsRemoved;

  console.log(`✓ Removed ${totalRemoved} stale memories (${insightsRemoved} insights, ${patternsRemoved} patterns)`);

  return {
    merged: 0,
    removed: totalRemoved,
    kept: 0,
  };
}

/**
 * Run complete consolidation for a user
 */
export async function consolidateUserMemories(
  userId: number,
  config: ConsolidationConfig = DEFAULT_CONFIG
): Promise<{
  insights: ConsolidationResult;
  patterns: ConsolidationResult;
  pruned: ConsolidationResult;
}> {
  console.log(`\n🧠 Starting complete memory consolidation for user ${userId}...`);

  const insights = await consolidateInsights(userId, config);
  const patterns = await consolidatePatterns(userId, config);
  const pruned = await pruneStaleMemories(userId, config);

  console.log(`\n✅ Memory consolidation complete for user ${userId}`);
  console.log(`   Insights: ${insights.merged} merged, ${insights.kept} kept`);
  console.log(`   Patterns: ${patterns.merged} merged, ${patterns.kept} kept`);
  console.log(`   Pruned: ${pruned.removed} stale memories removed`);

  return { insights, patterns, pruned };
}

/**
 * Run consolidation for all users
 */
export async function consolidateAllUsers(
  config: ConsolidationConfig = DEFAULT_CONFIG
): Promise<void> {
  console.log('🧠 Starting memory consolidation for all users...\n');

  // Get all users with memories
  const usersResult = await pool.query(
    `SELECT DISTINCT user_id FROM workout_insights
     UNION
     SELECT DISTINCT user_id FROM activity_patterns`
  );

  const users = usersResult.rows;
  console.log(`Found ${users.length} users with memories\n`);

  let successCount = 0;
  let failCount = 0;

  for (const { user_id } of users) {
    try {
      await consolidateUserMemories(user_id, config);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to consolidate memories for user ${user_id}:`, error);
      failCount++;
    }
  }

  console.log(`\n✅ Memory consolidation complete: ${successCount} succeeded, ${failCount} failed`);
}
