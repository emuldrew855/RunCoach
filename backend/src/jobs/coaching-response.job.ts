/**
 * Coaching Response Follow-up Cron Job
 *
 * Runs daily at 7:00 AM to check if coaching advice was effective.
 * Assesses whether runners changed their behavior after receiving specific guidance.
 *
 * Phase 2: Coaching Effectiveness Tracking
 */

import cron from 'node-cron';
import { checkFollowUpItems } from '../services/coachingResponseService';

/**
 * Schedule: Daily at 7:00 AM
 * Cron format: "minute hour day-of-month month day-of-week"
 * "0 7 * * *" = At 7:00 AM every day
 */
const FOLLOW_UP_SCHEDULE = '0 7 * * *';

/**
 * For testing: Run every hour (uncomment to test)
 * const FOLLOW_UP_SCHEDULE = '0 * * * *';
 */

/**
 * For testing: Run every 5 minutes (uncomment to test)
 * const FOLLOW_UP_SCHEDULE = '* /5 * * * *';
 */

/**
 * Start the coaching response follow-up cron job
 */
export function startCoachingResponseJob() {
  console.log('🕐 Scheduling coaching response follow-up job...');
  console.log(`📅 Schedule: Daily at 7:00 AM (${FOLLOW_UP_SCHEDULE})`);

  const task = cron.schedule(
    FOLLOW_UP_SCHEDULE,
    async () => {
      console.log('⏰ Coaching response follow-up job triggered!');
      console.log('🗓️ Time:', new Date().toISOString());

      try {
        await checkFollowUpItems();
        console.log('✅ Coaching response follow-up completed successfully');
      } catch (error) {
        console.error('❌ Coaching response follow-up job error:', error);
      }
    },
    {
      timezone: 'America/New_York', // Adjust to your timezone
    }
  );

  console.log('✅ Coaching response follow-up job scheduled successfully');
  return task;
}

/**
 * Manually trigger coaching response follow-up (for testing)
 */
export async function triggerCoachingResponseNow(): Promise<void> {
  console.log('🔧 Manually triggering coaching response follow-up...');

  try {
    await checkFollowUpItems();
    console.log('✅ Manual coaching response follow-up complete');
  } catch (error) {
    console.error('❌ Manual coaching response follow-up error:', error);
    throw error;
  }
}
