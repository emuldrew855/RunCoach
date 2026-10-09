import { createDatabasePool } from './database.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PgStore } from './store.js';

export async function migrate(pool, options = {}) {
  const store = new PgStore(pool, options);
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  await store.transaction(async db => {
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query('SELECT pg_advisory_xact_lock(1919118701, 1)');
    await db.query(schema);
    if (store.storageMode === 'standalone') await store.initialize(db);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    pool = createDatabasePool();
    await migrate(pool, { storageMode: process.env.STRAVA_CREDENTIAL_STORE || 'shared',
      credentialEncryptionKey: process.env.MCP_CREDENTIAL_ENCRYPTION_KEY });
    console.log('MCP schema ready');
  } catch {
    console.error('MCP migration failed; check database connection, schema permissions and credential encryption key');
    process.exitCode = 1;
  } finally { if (pool) await pool.end(); }
}
