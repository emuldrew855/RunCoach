import { Pool, PoolClient, QueryResult } from 'pg';
import * as path from 'path';
const { runMigrations: runTrackedMigrations } = require('../../scripts/migrationRunner');

// Create connection pool with Azure-compatible settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased from 2s for Azure latency
  // Keep connections alive - prevents Azure from closing idle connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
});

// Log pool errors - don't crash the process, let it recover
pool.on('error', (err) => {
  console.error('Database pool error (will attempt recovery):', err.message);
  // Don't exit - let the pool recover by acquiring new connections
});

// Query helper function
export async function query(
  text: string,
  params?: any[]
): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Disabled verbose query logging - uncomment below for debugging
    // console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error });
    throw error;
  }
}

// Get a client from the pool for transactions
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Run migrations
export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, '../../migrations');
  await runTrackedMigrations(pool, migrationsDir);
}

// Close pool
export async function closePool(): Promise<void> {
  await pool.end();
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export default pool;
