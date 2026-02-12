/**
 * Database Configuration for Agent Service
 *
 * Provides PostgreSQL connection pool for LangGraph checkpoint persistence.
 * Uses the same database as the main backend for simplicity.
 */

import { Pool } from 'pg';
import { config } from './env';

/**
 * PostgreSQL connection pool
 * Used by LangGraph PostgresSaver for checkpoint persistence
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Fail fast if connection takes > 2 seconds
});

/**
 * Handle unexpected database errors
 */
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

/**
 * Check database connectivity
 * Used during server startup to ensure database is reachable
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Database connected:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

/**
 * Gracefully close database connections
 * Used during server shutdown
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    console.log('✓ Database connections closed');
  } catch (error) {
    console.error('✗ Error closing database connections:', error);
  }
}
