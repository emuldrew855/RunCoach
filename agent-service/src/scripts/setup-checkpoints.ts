/**
 * Script to manually initialize LangGraph checkpoint tables
 *
 * NOTE: This script is now OPTIONAL!
 * Running "npm run dev" automatically creates checkpoint tables if they don't exist.
 *
 * This script is useful if you want to:
 * - Pre-create tables before starting the service
 * - Recreate tables after deletion
 * - Verify table creation independently
 *
 * Run with: npm run setup-checkpoints
 */

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pool, checkDatabaseConnection } from '../config/database';

async function setupCheckpoints() {
  try {
    console.log('🔧 Setting up LangGraph checkpoint tables...\n');

    // Check database connection
    console.log('📊 Checking database connection...');
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Initialize PostgresSaver and setup tables
    console.log('🗃️  Creating checkpoint tables...');
    const checkpointer = new PostgresSaver(pool);
    await checkpointer.setup();

    console.log('\n✅ Checkpoint tables created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('The following tables have been created:');
    console.log('  ✓ checkpoints');
    console.log('  ✓ checkpoint_writes');
    console.log('  ✓ checkpoint_blobs');
    console.log('  ✓ checkpoint_migrations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to setup checkpoint tables:', error);
    process.exit(1);
  }
}

setupCheckpoints();
