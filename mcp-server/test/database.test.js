import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseOptions } from '../src/database.js';

const databaseUrl = 'postgresql://runcoach-mcp@sample.postgres.database.azure.com/runcoach_mcp?sslmode=verify-full';

test('password connections preserve existing connection-string behavior', () => {
  const url = 'postgresql://user:password@localhost/database';
  assert.deepEqual(databaseOptions({ DATABASE_URL: url }), {
    connectionString: url, max: 10, connectionTimeoutMillis: 5000,
  });
  assert.throws(() => databaseOptions({}));
  assert.throws(() => databaseOptions({ DATABASE_URL: url, DATABASE_AUTH_MODE: 'other' }));
});

test('managed identity obtains a token for every new connection', async () => {
  let calls = 0;
  const options = databaseOptions({ DATABASE_URL: databaseUrl, DATABASE_AUTH_MODE: 'managed-identity' }, {
    async getToken(scope) {
      assert.equal(scope, 'https://ossrdbms-aad.database.windows.net/.default');
      return { token: `token-${++calls}` };
    },
  });
  assert.equal(await options.password(), 'token-1');
  assert.equal(await options.password(), 'token-2');
  const client = new pg.Client(options);
  assert.equal(client.connectionParameters.password, options.password);
  assert.deepEqual(client.connectionParameters.ssl, { rejectUnauthorized: true });
  assert.equal(client.connectionParameters.user, 'runcoach-mcp');
  assert.equal(client.connectionParameters.database, 'runcoach_mcp');
});

test('managed identity rejects passwords, unverified TLS, and connection-string overrides', () => {
  for (const url of [databaseUrl.replace('runcoach-mcp@', 'runcoach-mcp:password@'),
    databaseUrl.replace('runcoach-mcp@', ''), databaseUrl.replace('verify-full', 'require'),
    databaseUrl.replace('sample.postgres.database.azure.com', 'localhost'),
    databaseUrl.replace('postgresql:', 'http:'), `${databaseUrl}&password=unsafe`,
    `${databaseUrl}&sslcert=untrusted`, `${databaseUrl}&sslmode=no-verify`]) {
    assert.throws(() => databaseOptions({ DATABASE_URL: url, DATABASE_AUTH_MODE: 'managed-identity' }));
  }
});

test('managed identity acquisition fails explicitly without a token', async () => {
  const env = { DATABASE_URL: databaseUrl, DATABASE_AUTH_MODE: 'managed-identity' };
  for (const token of [null, {}, { token: '' }]) {
    const options = databaseOptions(env, { async getToken() { return token; } });
    await assert.rejects(options.password(), /token unavailable/);
  }
  const options = databaseOptions(env, { async getToken() { throw new Error('Identity endpoint unavailable'); } });
  await assert.rejects(options.password(), /Identity endpoint unavailable/);
});
