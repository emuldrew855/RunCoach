/**
 * Checkpoint Cleanup Job
 *
 * Scheduled job to clean up old checkpoints from the database.
 * Prevents unbounded growth of checkpoint data.
 */

import cron from 'node-cron';
import { pool } from '../config/database';

/**
 * Delete checkpoints older than the specified number of days
 * Default: 90 days
 */
async function cleanupOldCheckpoints(daysToKeep: number = 90): Promise<number> {
  try {
    const result = await pool.query(
      `
      DELETE FROM checkpoints
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      `,
      []
    );

    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up checkpoints:', error);
    throw error;
  }
}

/**
 * Delete checkpoint writes older than the specified number of days
 * Default: 90 days
 */
async function cleanupOldCheckpointWrites(daysToKeep: number = 90): Promise<number> {
  try {
    const result = await pool.query(
      `
      DELETE FROM checkpoint_writes
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      `,
      []
    );

    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up checkpoint writes:', error);
    throw error;
  }
}

/**
 * Schedule checkpoint cleanup job
 * Runs daily at 2 AM
 */
export function scheduleCheckpointCleanup(daysToKeep: number = 90): void {
  // Run daily at 2 AM (cron format: minute hour day month weekday)
  cron.schedule('0 2 * * *', async () => {
    console.log('🧹 Starting checkpoint cleanup job...');

    try {
      const checkpointsDeleted = await cleanupOldCheckpoints(daysToKeep);
      const writesDeleted = await cleanupOldCheckpointWrites(daysToKeep);

      console.log(`✓ Checkpoint cleanup completed:`);
      console.log(`  - Deleted ${checkpointsDeleted} old checkpoints`);
      console.log(`  - Deleted ${writesDeleted} old checkpoint writes`);
    } catch (error) {
      console.error('❌ Checkpoint cleanup failed:', error);
    }
  });

  console.log(`📅 Checkpoint cleanup job scheduled (daily at 2 AM, keeping ${daysToKeep} days)`);
}

/**
 * Run cleanup immediately (for testing or manual cleanup)
 */
export async function runCheckpointCleanupNow(daysToKeep: number = 90): Promise<void> {
  console.log('🧹 Running checkpoint cleanup now...');

  try {
    const checkpointsDeleted = await cleanupOldCheckpoints(daysToKeep);
    const writesDeleted = await cleanupOldCheckpointWrites(daysToKeep);

    console.log(`✓ Checkpoint cleanup completed:`);
    console.log(`  - Deleted ${checkpointsDeleted} old checkpoints`);
    console.log(`  - Deleted ${writesDeleted} old checkpoint writes`);
  } catch (error) {
    console.error('❌ Checkpoint cleanup failed:', error);
    throw error;
  }
}
