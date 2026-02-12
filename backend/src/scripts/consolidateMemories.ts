/**
 * Memory Consolidation Script
 *
 * Run this script periodically (e.g., nightly via cron) to:
 * 1. Merge duplicate insights (95%+ similarity)
 * 2. Consolidate similar activity patterns
 * 3. Prune stale memories (6+ months old with low occurrence)
 *
 * Usage:
 *   npm run consolidate:memories
 *   or
 *   ts-node src/scripts/consolidateMemories.ts
 *
 * Cron example (daily at 2 AM):
 *   0 2 * * * cd /path/to/backend && npm run consolidate:memories
 */

import pool from '../config/database';
import { consolidateAllUsers } from '../services/memoryConsolidationService';

async function runConsolidation() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║      🧹 Memory Consolidation Job - Nightly Cleanup      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    await consolidateAllUsers();

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║            ✅ CONSOLIDATION COMPLETE                     ║');
    console.log(`║              Completed in ${duration} seconds                    ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ Consolidation failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run consolidation
runConsolidation().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
