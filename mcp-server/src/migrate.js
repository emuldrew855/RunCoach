import pg from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await pool.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  console.log('MCP schema ready');
} catch {
  console.error('MCP migration failed; check database connection and schema permissions');
  process.exitCode = 1;
} finally { await pool.end(); }
