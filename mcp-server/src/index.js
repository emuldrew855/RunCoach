import pg from 'pg';
import { loadConfig } from './config.js';
import { PgStore } from './store.js';
import { createApp } from './app.js';

let pool;
try {
  const config = loadConfig();
  pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
  pool.on('error', () => console.error('MCP database connection unavailable'));
  const store = new PgStore(pool);
  await pool.query('SELECT 1 FROM runcoach_mcp.grants LIMIT 1');
  await pool.query('SELECT strava_id,access_token,refresh_token,token_expires_at FROM public.users LIMIT 0');
  const server = createApp({ config, store }).listen(config.port, '127.0.0.1', () => console.log('RunCoach MCP server ready'));
  const timer = setInterval(() => { void store.cleanup().catch(() => console.error('MCP cleanup unavailable')); }, 60_000);
  timer.unref();
  server.on('error', () => {
    clearInterval(timer);
    console.error('MCP listener unavailable');
    void pool.end();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    clearInterval(timer);
    server.close(() => { void pool.end(); });
  });
} catch {
  if (pool) await pool.end();
  console.error('MCP startup failed; check configuration and run npm run migrate');
  process.exitCode = 1;
}
