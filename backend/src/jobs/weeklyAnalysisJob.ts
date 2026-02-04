/**
 * Weekly Analysis Cron Job
 *
 * Runs every Monday at 6:00 AM to perform automated training analysis for all users.
 * Uses node-cron for scheduling.
 */

import cron from 'node-cron';
import { performWeeklyAnalysisForAllUsers } from '../services/weeklyAnalysisService';

/**
 * Schedule: Every Monday at 6:00 AM
 * Cron format: "minute hour day-of-month month day-of-week"
 * "0 6 * * 1" = At 6:00 AM on Monday
 */
const WEEKLY_ANALYSIS_SCHEDULE = '0 6 * * 1';

/**
 * For testing: Run every minute (uncomment to test)
 * const WEEKLY_ANALYSIS_SCHEDULE = '* * * * *';
 */

/**
 * For testing: Run every 5 minutes (uncomment to test)
 * const WEEKLY_ANALYSIS_SCHEDULE = '* /5 * * * *';
 */

/**
 * Start the weekly analysis cron job
 */
export function startWeeklyAnalysisJob() {
  console.log('🕐 Scheduling weekly analysis job...');
  console.log(`📅 Schedule: Every Monday at 6:00 AM (${WEEKLY_ANALYSIS_SCHEDULE})`);

  const task = cron.schedule(
    WEEKLY_ANALYSIS_SCHEDULE,
    async () => {
      console.log('⏰ Weekly analysis job triggered!');
      console.log('🗓️ Time:', new Date().toISOString());

      try {
        const result = await performWeeklyAnalysisForAllUsers();

        console.log('📊 Weekly analysis job results:');
        console.log('  - Total users:', result.total);
        console.log('  - Successful:', result.successful);
        console.log('  - Failed:', result.failed);

        if (result.failed > 0) {
          console.warn('⚠️', result.failed, 'users failed analysis');
        }
      } catch (error) {
        console.error('❌ Weekly analysis job error:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'America/New_York', // Adjust to your timezone
    }
  );

  console.log('✅ Weekly analysis job scheduled successfully');
  return task;
}

/**
 * Manually trigger weekly analysis (for testing)
 */
export async function triggerWeeklyAnalysisNow(): Promise<void> {
  console.log('🔧 Manually triggering weekly analysis...');

  try {
    const result = await performWeeklyAnalysisForAllUsers();

    console.log('✅ Manual weekly analysis complete:');
    console.log(`  - Total users: ${result.total}`);
    console.log(`  - Successful: ${result.successful}`);
    console.log(`  - Failed: ${result.failed}`);
  } catch (error) {
    console.error('❌ Manual weekly analysis error:', error);
    throw error;
  }
}
