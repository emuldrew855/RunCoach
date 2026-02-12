/**
 * Runner Tendency Analysis Cron Job
 *
 * Runs bi-weekly (1st and 15th of each month) at 6:00 AM to compute behavioral patterns
 * for all active users. Analyzes 4-6 weeks of training data to detect persistent tendencies.
 *
 * Phase 2: Behavioral Memory System
 */

import cron from 'node-cron';
import { batchComputeTendencies } from '../services/runnerTendencyService';

/**
 * Schedule: Bi-weekly - 1st and 15th of each month at 6:00 AM
 * Cron format: "minute hour day-of-month month day-of-week"
 * "0 6 1,15 * *" = At 6:00 AM on the 1st and 15th day of every month
 */
const TENDENCY_SCHEDULE = '0 6 1,15 * *';

/**
 * For testing: Run every hour (uncomment to test)
 * const TENDENCY_SCHEDULE = '0 * * * *';
 */

/**
 * For testing: Run every 5 minutes (uncomment to test)
 * const TENDENCY_SCHEDULE = '* /5 * * * *';
 */

/**
 * Start the runner tendency analysis cron job
 */
export function startRunnerTendencyJob() {
  console.log('🕐 Scheduling runner tendency analysis job...');
  console.log(`📅 Schedule: Bi-weekly (1st & 15th) at 6:00 AM (${TENDENCY_SCHEDULE})`);

  const task = cron.schedule(
    TENDENCY_SCHEDULE,
    async () => {
      console.log('⏰ Runner tendency analysis job triggered!');
      console.log('🗓️ Time:', new Date().toISOString());

      try {
        await batchComputeTendencies();
        console.log('✅ Runner tendency analysis completed successfully');
      } catch (error) {
        console.error('❌ Runner tendency analysis job error:', error);
      }
    },
    {
      timezone: 'America/New_York', // Adjust to your timezone
    }
  );

  console.log('✅ Runner tendency job scheduled successfully');
  return task;
}

/**
 * Manually trigger runner tendency analysis (for testing)
 */
export async function triggerRunnerTendencyNow(): Promise<void> {
  console.log('🔧 Manually triggering runner tendency analysis...');

  try {
    await batchComputeTendencies();
    console.log('✅ Manual runner tendency analysis complete');
  } catch (error) {
    console.error('❌ Manual runner tendency analysis error:', error);
    throw error;
  }
}
