/**
 * Startup Verification Module
 *
 * Ensures all prerequisites are met before starting the agent service:
 * - Database connection
 * - Checkpoint tables exist (creates if missing)
 * - Required environment variables
 */

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import axios from 'axios';
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
 * Check connectivity to backend service
 */
async function checkBackendConnectivity(): Promise<boolean> {
  console.log('\n4️⃣ Checking backend connectivity...');
  console.log(`   Backend URL: ${config.backendApiUrl}`);

  try {
    const response = await axios.get(`${config.backendApiUrl}/health`, {
      timeout: 10000,
      headers: {
        'X-Service-Token': config.backendServiceToken,
      },
    });

    if (response.status === 200) {
      console.log('   ✅ Backend service is reachable');
      return true;
    } else {
      console.warn(`   ⚠️  Backend returned status ${response.status}`);
      return false;
    }
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error('   ❌ Backend connection refused - is the backend running?');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   ❌ Backend host not found - check BACKEND_API_URL');
    } else if (error.response?.status === 401) {
      console.error('   ❌ Backend auth failed - check BACKEND_SERVICE_TOKEN matches backend SERVICE_SECRET');
    } else {
      console.error('   ❌ Backend connection error:', error.message);
    }
    return false;
  }
}

/**
 * Verify service-to-service authentication
 */
async function checkServiceAuth(): Promise<boolean> {
  console.log('\n5️⃣ Checking service-to-service auth...');

  try {
    // Try to call a protected endpoint
    const response = await axios.get(`${config.backendApiUrl}/api/v1/agent/context/1`, {
      timeout: 10000,
      headers: {
        'X-Service-Token': config.backendServiceToken,
      },
      validateStatus: (status) => status < 500, // Accept 4xx as valid (just means no user 1)
    });

    if (response.status === 401) {
      console.error('   ❌ Service token rejected by backend');
      console.error('   💡 Ensure BACKEND_SERVICE_TOKEN matches backend SERVICE_SECRET');
      return false;
    }

    console.log('   ✅ Service token accepted by backend');
    return true;
  } catch (error: any) {
    console.error('   ❌ Service auth check failed:', error.message);
    return false;
  }
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

    // 4. Check backend connectivity
    const backendReachable = await checkBackendConnectivity();
    if (!backendReachable) {
      console.warn('   ⚠️  Backend not reachable - agent will retry on requests');
    }

    // 5. Check service-to-service auth (only if backend is reachable)
    // Note: This is non-blocking since both services may deploy simultaneously
    if (backendReachable) {
      const authOk = await checkServiceAuth();
      if (!authOk) {
        console.warn('   ⚠️  Service authentication check failed');
        console.warn('   💡 Ensure BACKEND_SERVICE_TOKEN matches backend SERVICE_SECRET');
        console.warn('   ℹ️  Agent will continue - auth will be retried on requests');
      }
    } else {
      console.warn('   ⚠️  Skipping auth check - backend not reachable yet');
      console.warn('   ℹ️  This is normal if both services are starting simultaneously');
    }

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
