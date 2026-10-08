/**
 * Database Migration Script
 *
 * Uses the same tracked, advisory-lock-serialized runner as application startup.
 */

const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('./migrationRunner');

// Load environment variables
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    await runMigrations(pool, path.join(__dirname, '..', 'migrations'));
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
