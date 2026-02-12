/**
 * Verification Script
 * Run this to check if checkpoint tables exist before starting the agent service
 *
 * NOTE: This script is optional - "npm run dev" now handles setup automatically!
 * This script is useful for verifying setup without starting the service.
 */

import { pool } from './src/config/database';
import { verifyOnly } from './src/utils/startupVerification';

async function verify() {
  try {
    const success = await verifyOnly();

    if (success) {
      console.log('🚀 You can now start the agent service:');
      console.log('   npm run dev\n');
    }

    await pool.end();
    process.exit(success ? 0 : 1);
  } catch (error: any) {
    console.error('\nError:', error.message);
    await pool.end();
    process.exit(1);
  }
}

verify();
