import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PgStore, hash, random } from '../src/store.js';
import { migrate } from '../src/migrate.js';
import { Strava } from '../src/strava.js';

const key = randomBytes(32).toString('base64');
const options = { storageMode: 'standalone', credentialEncryptionKey: key };
const credentials = label => ({
  access_token: `access-${label}`, refresh_token: `refresh-${label}`,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('standalone configuration fails closed; shared mode remains the default', () => {
  assert.equal(new PgStore({}).storageMode, 'shared');
  assert.throws(() => new PgStore({}, { storageMode: 'unknown' }), /storage mode/);
  for (const credentialEncryptionKey of [undefined, '', 'secret', randomBytes(31).toString('base64'), key + '\n', key.replace(/=+$/, ''), randomBytes(33)]) {
    assert.throws(() => new PgStore({}, { storageMode: 'standalone', credentialEncryptionKey }), /32-byte encryption key/);
  }
  assert.doesNotThrow(() => new PgStore({}, { ...options, credentialEncryptionKey: Buffer.from(key, 'base64') }));
});

test('AES-256-GCM envelopes use independent nonces and bind authentication to athlete identity', () => {
  const store = new PgStore({}, options), clear = credentials('private');
  const encrypted = store.encryptCredentials(7, clear);
  assert.equal(encrypted.includes(Buffer.from(clear.access_token)), false);
  assert.equal(encrypted.includes(Buffer.from(clear.refresh_token)), false);
  assert.notDeepEqual(store.encryptCredentials(7, clear), encrypted);
  assert.deepEqual(store.decryptCredentials('7', encrypted), clear);
  const restarted = new PgStore({}, options);
  assert.deepEqual(restarted.decryptCredentials(7, encrypted), clear);
  for (const offset of [0, 1, 13, 29, encrypted.length - 1]) {
    const tampered = Buffer.from(encrypted);
    tampered[offset] ^= 1;
    assert.throws(() => restarted.decryptCredentials(7, tampered), { code: 'credential_storage_unavailable', status: 503 });
  }
  for (const payload of [Buffer.alloc(0), encrypted.subarray(0, 29), encrypted.toString('base64')]) {
    assert.throws(() => store.decryptCredentials(7, payload), /credential_storage_unavailable/);
  }
  assert.throws(() => store.decryptCredentials(8, encrypted), /credential_storage_unavailable/);
  assert.throws(() => new PgStore({}, { ...options, credentialEncryptionKey: randomBytes(32).toString('base64') }).decryptCredentials(7, encrypted), /credential_storage_unavailable/);
});

test('standalone initialization checks its own tables and never accesses public.users', async () => {
  const queries = [], store = new PgStore({
    query: async sql => { queries.push(sql); return { rows: [] }; },
  }, options);
  await store.initialize();
  assert.ok(queries.some(sql => sql.includes('runcoach_mcp.credentials')));
  assert.ok(queries.every(sql => !sql.includes('public.users')));
  const encrypted = store.encryptCredentials(7, credentials('initialization'));
  encrypted[13] ^= 1;
  await assert.rejects(store.initialize({ query: async () => ({ rows: [{ athlete_id: 7, encrypted_credentials: encrypted }] }) }), /credential_storage_unavailable/);
});

test('isolated PostgreSQL standalone durable storage, migrations and upstream locking', {
  skip: !process.env.MCP_STORAGE_TEST_DATABASE_URL,
}, async t => {
  const url = new URL(process.env.MCP_STORAGE_TEST_DATABASE_URL);
  assert.ok(url.pathname.endsWith('_test'), 'Use a dedicated database ending in _test; this test clears the MCP schema');
  const pool = new pg.Pool({ connectionString: url.href, max: 8 });
  t.after(() => pool.end());
  await pool.query('DROP SCHEMA IF EXISTS runcoach_mcp CASCADE');
  assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null,
    'Standalone test database must have no application users table');
  let store = new PgStore(pool, options);
  await t.test('transactional concurrent bootstrap is idempotent and preserves legacy columns', async () => {
    await Promise.all([migrate(pool, options), migrate(pool, options)]);
    await store.initialize();
    await pool.query("ALTER TABLE runcoach_mcp.connections ADD COLUMN credentials TEXT NOT NULL");
    await pool.query("INSERT INTO runcoach_mcp.connections (athlete_id,credentials) VALUES (100,'preserve-this')");
    await migrate(pool, options);
    assert.equal((await pool.query('SELECT credentials FROM runcoach_mcp.connections WHERE athlete_id=100')).rows[0].credentials, 'preserve-this');
    await pool.query('INSERT INTO runcoach_mcp.connections (athlete_id) VALUES (101)');
    assert.equal((await pool.query('SELECT credentials FROM runcoach_mcp.connections WHERE athlete_id=101')).rows[0].credentials, null);
    assert.equal(Number((await pool.query('SELECT count(*) FROM runcoach_mcp.credentials')).rows[0].count), 0);
  });
  await t.test('credentials survive process restart, remain encrypted and isolate athletes', async () => {
    for (const id of [7, 8]) await store.authorizeCredentials(async () => ({ athleteId: id, credentials: credentials(id) }));
    const rows = (await pool.query('SELECT * FROM runcoach_mcp.credentials ORDER BY athlete_id')).rows;
    assert.deepEqual(rows.map(row => row.athlete_id), ['7', '8']);
    for (const row of rows) assert.equal(row.encrypted_credentials.includes(Buffer.from('access-')), false);
    store = new PgStore(pool, options);
    await store.initialize();
    for (const id of [7, 8]) assert.equal(await store.credentials(id, async stored => ({ value: stored.access_token })), `access-${id}`);
    await assert.rejects(store.credentials(9, async () => assert.fail('unknown athlete contacted upstream')), /invalid_grant/);
    assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null);
  });
  await t.test('authenticated corruption and wrong startup keys fail before upstream', async () => {
    const original = (await pool.query('SELECT encrypted_credentials FROM runcoach_mcp.credentials WHERE athlete_id=7')).rows[0].encrypted_credentials;
    const tampered = Buffer.from(original);
    tampered[29] ^= 1;
    await pool.query('UPDATE runcoach_mcp.credentials SET encrypted_credentials=$1 WHERE athlete_id=7', [tampered]);
    try {
      await assert.rejects(store.initialize(), /credential_storage_unavailable/);
      await assert.rejects(store.credentials(7, async () => assert.fail('corrupt credentials contacted upstream')), /credential_storage_unavailable/);
      await assert.rejects(migrate(pool, options), /credential_storage_unavailable/);
    } finally {
      await pool.query('UPDATE runcoach_mcp.credentials SET encrypted_credentials=$1 WHERE athlete_id=7', [original]);
    }
    await pool.query('DROP INDEX runcoach_mcp.mcp_tokens_expiry');
    await assert.rejects(migrate(pool, { ...options, credentialEncryptionKey: randomBytes(32).toString('base64') }), /credential_storage_unavailable/);
    assert.equal((await pool.query("SELECT to_regclass('runcoach_mcp.mcp_tokens_expiry') AS index")).rows[0].index, null,
      'Failed key validation rolls back all schema changes');
    await migrate(pool, options);
    await store.initialize();
  });
  await t.test('row locking serializes refresh across independent store instances and rolls back failures', async () => {
    await store.authorizeCredentials(async () => ({ athleteId: 7, credentials: { ...credentials('expired'), expires_at: 1 } }));
    let refreshes = 0;
    const upstream = async () => {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return Response.json(credentials('rotated'));
    };
    const a = new Strava({}, store, upstream), b = new Strava({}, new PgStore(pool, options), upstream);
    assert.deepEqual(await Promise.all([a.access(7), b.access(7)]), ['access-rotated', 'access-rotated']);
    assert.equal(refreshes, 1);
    const before = (await pool.query('SELECT encrypted_credentials FROM runcoach_mcp.credentials WHERE athlete_id=7')).rows[0];
    await assert.rejects(new Strava({}, store, async () => new Response('private upstream error', { status: 500 })).access(7, true), /strava_unavailable/);
    assert.deepEqual((await pool.query('SELECT encrypted_credentials FROM runcoach_mcp.credentials WHERE athlete_id=7')).rows[0], before);
  });
  await t.test('unknown-identity exchange blocks refresh before rotation', async () => {
    const entered = deferred(), gate = deferred();
    const authorizing = store.authorizeCredentials(async () => {
      entered.resolve(); await gate.promise;
      return { athleteId: 7, credentials: credentials('authorized') };
    });
    await entered.promise;
    let enteredRefresh = false;
    const refreshing = new PgStore(pool, options).credentials(7, async stored => {
      enteredRefresh = true;
      assert.equal(stored.refresh_token, 'refresh-authorized');
      return { value: stored.access_token };
    });
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(enteredRefresh, false);
    } finally { gate.resolve(); }
    await authorizing;
    assert.equal(await refreshing, 'access-authorized');
  });
  await t.test('refresh blocks authorization for every athlete before upstream exchange', async () => {
    const entered = deferred(), gate = deferred();
    const refreshing = store.credentials(7, async () => {
      entered.resolve(); await gate.promise;
      return { credentials: credentials('refreshed-again'), value: 'done' };
    });
    await entered.promise;
    let enteredExchange = false;
    const authorizing = new PgStore(pool, options).authorizeCredentials(async () => {
      enteredExchange = true;
      return { athleteId: 8, credentials: credentials('second-authorized') };
    });
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(enteredExchange, false);
    } finally { gate.resolve(); }
    await Promise.all([refreshing, authorizing]);
    assert.equal(await store.credentials(7, async stored => ({ value: stored.refresh_token })), 'refresh-refreshed-again');
    assert.equal(await store.credentials(8, async stored => ({ value: stored.refresh_token })), 'refresh-second-authorized');
  });
  await t.test('registration-wide locks have a bounded timeout before contacting upstream', async () => {
    const db = await pool.connect();
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1919118701, 1)');
    try {
      await assert.rejects(store.authorizeCredentials(async () => assert.fail('blocked exchange contacted upstream')),
        error => error.code === '55P03');
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  });
  await t.test('durable grants, denial and revocation do not erase another client credentials', async () => {
    const flow = async allow => {
      const id = random(), browserHash = hash(random());
      await store.createRequest(id, browserHash, { clientId: 'test-client', resource: 'https://mcp.example/mcp' });
      const callback = await store.stravaCallback(id, browserHash, async () => ({ athleteId: 7, credentials: credentials('consented') }));
      return store.consent(id, browserHash, callback.csrf, allow);
    };
    const first = await flow(true), second = await flow(true);
    const one = await store.exchange(first.code, 'code', 'test-client', () => true);
    const two = await store.exchange(second.code, 'code', 'test-client', () => true);
    store = new PgStore(pool, options);
    await store.initialize();
    assert.equal((await store.authenticate(one.access_token)).athlete_id, '7');
    await flow(false);
    await store.revoke(one.refresh_token, 'test-client');
    await assert.rejects(store.authenticate(one.access_token), /invalid_token/);
    await assert.rejects(store.exchange(one.refresh_token, 'refresh', 'test-client', () => true), /invalid_grant/);
    assert.equal((await store.authenticate(two.access_token)).athlete_id, '7');
    const rotated = await store.exchange(two.refresh_token, 'refresh', 'test-client', () => true);
    await assert.rejects(store.exchange(two.refresh_token, 'refresh', 'test-client', () => true), /invalid_grant/);
    await store.revoke(rotated.refresh_token, 'test-client');
    await store.cleanup();
    assert.equal(await store.credentials(7, async stored => ({ value: stored.refresh_token })), 'refresh-consented',
      'Retain orphan encrypted credentials rather than racing another pending authorization');
    assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null);
  });
  await t.test('standalone authorization and refresh never mutate existing application users', async () => {
    await pool.query(`CREATE TABLE public.users (
      strava_id BIGINT PRIMARY KEY,access_token TEXT,refresh_token TEXT,token_expires_at BIGINT,first_name TEXT
    )`);
    await pool.query("INSERT INTO public.users VALUES (7,'app-access','app-refresh',123,'Existing Runner')");
    const before = (await pool.query('SELECT * FROM public.users')).rows;
    await store.authorizeCredentials(async () => ({ athleteId: 7, credentials: credentials('independent-app') }));
    await store.credentials(7, async () => ({ credentials: credentials('independent-refresh'), value: true }));
    await store.initialize();
    await store.cleanup();
    assert.deepEqual((await pool.query('SELECT * FROM public.users')).rows, before);
    await pool.query('DROP TABLE public.users');
  });
});
