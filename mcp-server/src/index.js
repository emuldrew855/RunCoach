import { createDatabasePool } from './database.js';
import { loadConfig } from './config.js';
import { PgStore } from './store.js';
import { createApp } from './app.js';
import { migrate } from './migrate.js';

let pool;
try {
  const config = loadConfig();
  pool = createDatabasePool();
  pool.on('error', () => console.error('MCP database connection unavailable'));
  const options = { storageMode: config.storageMode, credentialEncryptionKey: config.credentialEncryptionKey };
  const store = new PgStore(pool, options);
  await migrate(pool, options);
  await store.initialize();
  const server = createApp({ config, store }).listen(config.port, config.host, () => console.log('RunCoach MCP server ready'));
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
  console.error('MCP startup failed; check configuration, database connection and schema permissions');
  process.exitCode = 1;
}
