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
 *
 * Azure-compatible settings to prevent connection timeout issues
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Increased from 2s for Azure latency
  // Keep connections alive - prevents Azure from closing idle connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
});

/**
 * Handle unexpected database errors
 * Don't crash - let the pool recover by acquiring new connections
 */
pool.on('error', (err) => {
  console.error('❌ Database pool error (will attempt recovery):', err.message);
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
