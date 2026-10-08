const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Shared by the startup runner and the CLI; keep this key stable across releases.
const LOCK_KEY = [1381322307, 1];

function assertTransactional(sql, file) {
  // Ignore strings, identifiers, comments, and PL/pgSQL bodies before checking
  // top-level statements. A migration must not commit the runner's transaction.
  const statements = sql.replace(
    /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:[^"]|"")*"|\$([a-zA-Z_][a-zA-Z_0-9]*|)\$[\s\S]*?\$\1\$/g,
    ' '
  );
  if (statements.split(';').some(statement =>
    /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i.test(statement)
  ) || /\bCONCURRENTLY\b/i.test(statements)) {
    throw new Error(`Migration ${file} contains transaction control or CONCURRENTLY; only atomic transactional migrations are supported`);
  }
}

async function runMigrations(pool, migrationsDir) {
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDir}`);
  }
  const migrations = files.map(file => {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    assertTransactional(sql, file);
    return {
      file,
      sql,
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });

  const client = await pool.connect();
  let locked = false;
  let inTransaction = false;
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', LOCK_KEY);
    locked = true;
    await client.query('SET search_path TO public');
    await client.query('BEGIN');
    inTransaction = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows: applied } = await client.query(
      'SELECT filename, checksum FROM public.schema_migrations ORDER BY filename'
    );

    if (applied.length === 0) {
      // Extension-owned objects do not imply an existing application schema.
      const { rows } = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
            AND c.oid <> 'public.schema_migrations'::regclass
            AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
            )
          UNION ALL
          SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
            AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
            )
          UNION ALL
          SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
            AND t.typtype IN ('e', 'd')
            AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
            )
        ) AS nonempty
      `);
      if (rows[0].nonempty) {
        throw new Error(
          'Refusing to migrate an untracked, nonempty database. Back up the database, ' +
          'verify which migration prefix is already reflected in its schema, and manually ' +
          'baseline public.schema_migrations (filename and SHA-256 checksum) under advisory ' +
          `lock (${LOCK_KEY.join(', ')}). Never replay historical migrations to establish a baseline.`
        );
      }
    }

    const byFilename = new Map(migrations.map(migration => [migration.file, migration]));
    for (const row of applied) {
      const migration = byFilename.get(row.filename);
      if (!migration || migration.checksum !== row.checksum) {
        throw new Error(`Applied migration is missing or has changed: ${row.filename}`);
      }
    }
    const appliedNames = new Set(applied.map(row => row.filename));
    const lastApplied = applied.length ? applied[applied.length - 1].filename : '';
    for (const migration of migrations) {
      if (!appliedNames.has(migration.file) && migration.file < lastApplied) {
        throw new Error(`Untracked migration precedes applied history: ${migration.file}`);
      }
    }
    await client.query('COMMIT');
    inTransaction = false;

    for (const migration of migrations) {
      if (appliedNames.has(migration.file)) continue;
      console.log(`Running migration: ${migration.file}`);
      await client.query('BEGIN');
      inTransaction = true;
      // All repository migrations are transactional. Nontransactional statements
      // (e.g. CREATE INDEX CONCURRENTLY) fail here rather than being falsely recorded.
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)',
        [migration.file, migration.checksum]
      );
      await client.query('COMMIT');
      inTransaction = false;
      console.log(`✓ Migration ${migration.file} completed`);
    }
    console.log('All migrations completed successfully');
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Migration rollback failed:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1, $2)', LOCK_KEY);
    } finally {
      // Destroy this session even if rollback/unlock failed; no session lock or
      // altered search_path may leak into regular application queries.
      client.release(true);
    }
  }
}

module.exports = { runMigrations };
