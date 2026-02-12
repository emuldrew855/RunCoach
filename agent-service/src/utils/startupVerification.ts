/**
 * Startup Verification Module
 *
 * Ensures all prerequisites are met before starting the agent service:
 * - Database connection
 * - Checkpoint tables exist (creates if missing)
 * - Required environment variables
 */

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pool, checkDatabaseConnection } from '../config/database';
import { config } from '../config/env';

/**
 * Check if LangGraph checkpoint tables exist
 */
async function checkCheckpointTables(): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename LIKE 'checkpoint%'
      ORDER BY tablename
    `);

    const tables = result.rows.map(r => r.tablename);
    const requiredTables = ['checkpoints', 'checkpoint_writes', 'checkpoint_blobs', 'checkpoint_migrations'];

    // Check if all required tables exist
    const allTablesExist = requiredTables.every(table => tables.includes(table));

    if (allTablesExist) {
      console.log('   ✅ Checkpoint tables verified');
      return true;
    }

    if (tables.length > 0 && !allTablesExist) {
      console.warn('   ⚠️  Partial checkpoint tables found:', tables);
      console.warn('   🔄 Will recreate all tables...');
    }

    return false;
  } catch (error) {
    console.error('   ❌ Error checking checkpoint tables:', error);
    return false;
  }
}

/**
 * Automatically setup checkpoint tables
 */
async function setupCheckpointTables(): Promise<void> {
  try {
    console.log('   🔧 Creating checkpoint tables...');

    const checkpointer = new PostgresSaver(pool);
    await checkpointer.setup();

    console.log('   ✅ Checkpoint tables created successfully');
    console.log('      - checkpoints');
    console.log('      - checkpoint_writes');
    console.log('      - checkpoint_blobs');
    console.log('      - checkpoint_migrations');
  } catch (error: any) {
    console.error('   ❌ Failed to create checkpoint tables:', error.message);
    throw new Error('Checkpoint table setup failed: ' + error.message);
  }
}

/**
 * Verify required environment variables
 */
function checkEnvironmentVariables(): void {
  console.log('\n3️⃣ Checking environment variables...');

  const requiredEnvVars = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'BACKEND_API_URL',
    'SERVICE_SECRET',
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('   ❌ Missing environment variables:', missing.join(', '));
    console.error('\n💡 Fix:');
    console.error('   1. Check your agent-service/.env file');
    console.error('   2. Ensure all required variables are set');
    throw new Error('Missing required environment variables: ' + missing.join(', '));
  }

  console.log('   ✅ All required environment variables set');
}

/**
 * Comprehensive startup verification
 * Runs all checks and automatically fixes issues when possible
 */
export async function verifyStartup(): Promise<void> {
  console.log('🔍 Verifying agent service setup...\n');

  try {
    // 1. Check database connection
    console.log('1️⃣ Checking database connection...');
    const connected = await checkDatabaseConnection();

    if (!connected) {
      console.error('   ❌ Database connection failed');
      console.error('\n💡 Fix:');
      console.error('   1. Ensure PostgreSQL is running: docker-compose up -d');
      console.error('   2. Check DATABASE_URL in agent-service/.env');
      console.error('   3. Verify port and credentials are correct');
      throw new Error('Database connection failed');
    }

    // 2. Check and setup checkpoint tables
    console.log('\n2️⃣ Checking checkpoint tables...');
    const tablesExist = await checkCheckpointTables();

    if (!tablesExist) {
      console.log('   ℹ️  Checkpoint tables not found - setting up automatically...');
      await setupCheckpointTables();
    }

    // 3. Check environment variables
    checkEnvironmentVariables();

    // Success!
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Startup verification complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Startup verification failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('\nError:', error.message);
    console.error('\n💡 Common fixes:');
    console.error('   1. Ensure PostgreSQL is running: docker-compose up -d');
    console.error('   2. Check agent-service/.env file exists and is configured');
    console.error('   3. Verify DATABASE_URL is correct');
    console.error('   4. Check network connectivity to database\n');

    throw error;
  }
}

/**
 * Verify without automatic setup (for manual verification script)
 */
export async function verifyOnly(): Promise<boolean> {
  console.log('🔍 Verifying agent service setup...\n');

  try {
    // 1. Database
    console.log('1️⃣ Checking database connection...');
    const connected = await checkDatabaseConnection();
    if (!connected) {
      console.error('   ❌ Database connection failed');
      return false;
    }

    // 2. Checkpoint tables
    console.log('\n2️⃣ Checking checkpoint tables...');
    const tablesExist = await checkCheckpointTables();
    if (!tablesExist) {
      console.error('   ❌ Checkpoint tables not found');
      console.error('   💡 Run: npm run dev (will auto-create)');
      return false;
    }

    // 3. Environment variables
    checkEnvironmentVariables();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Agent service setup verified!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return true;
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    return false;
  }
}
