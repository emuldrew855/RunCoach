import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { PgStore } from '../src/store.js';

test('deployment ZIP boots without dotenv, migrates automatically and refuses changed encryption keys', {
  skip: !process.env.MCP_STARTUP_TEST_DATABASE_URL,
}, async t => {
  const databaseUrl = new URL(process.env.MCP_STARTUP_TEST_DATABASE_URL);
  assert.ok(databaseUrl.pathname.endsWith('_test'), 'Use a separate startup-test database ending in _test');
  const source = fileURLToPath(new URL('..', import.meta.url));
  const fixture = await mkdtemp(path.join(tmpdir(), 'mcp-storage-startup-'));
  const bundle = path.join(fixture, 'bundle'), extracted = path.join(fixture, 'extracted');
  const pool = new pg.Pool({ connectionString: databaseUrl.href });
  let child;
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    child = undefined;
  };
  t.after(async () => { await stop(); await pool.end(); await rm(fixture, { recursive: true, force: true }); });
  assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null,
    'Startup tests must never use a database with application tables');
  await pool.query('DROP SCHEMA IF EXISTS runcoach_mcp CASCADE');
  await mkdir(path.join(bundle, 'schema'), { recursive: true });
  for (const name of ['src', 'schema.sql', 'package.json', 'package-lock.json']) {
    await cp(path.join(source, name), path.join(bundle, name), { recursive: true });
  }
  await cp(path.join(source, 'schema', 'tools.json'), path.join(bundle, 'schema', 'tools.json'));
  await mkdir(path.join(bundle, 'node_modules'));
  for (const name of await readdir(path.join(source, 'node_modules'))) {
    if (!name.startsWith('.storage-')) await cp(path.join(source, 'node_modules', name), path.join(bundle, 'node_modules', name), { recursive: true });
  }
  const archive = path.join(fixture, 'mcp-deploy.zip');
  execFileSync('zip', ['-qr', archive, 'src', 'schema', 'schema.sql', 'package.json', 'package-lock.json', 'node_modules'], { cwd: bundle });
  await mkdir(extracted);
  execFileSync('unzip', ['-q', archive, '-d', extracted]);
  assert.deepEqual((await readdir(extracted)).sort(), ['node_modules', 'package-lock.json', 'package.json', 'schema', 'schema.sql', 'src']);
  const manifest = JSON.parse(await readFile(path.join(extracted, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.start, 'node --env-file-if-exists=.env src/index.js');
  assert.equal(manifest.dependencies.dotenv, undefined);
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const key = randomBytes(32).toString('base64');
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production',
    DATABASE_URL: databaseUrl.href, HOST: '127.0.0.1', PORT: String(port),
    MCP_PUBLIC_URL: `https://127.0.0.1:${port}`, MCP_CLIENT_ID: 'synthetic-startup-client',
    MCP_CLIENT_SECRET: 'synthetic-startup-client-secret', MCP_REDIRECT_URIS: 'https://chatgpt.com/callback',
    STRAVA_CLIENT_ID: 'synthetic-independent-startup-strava', STRAVA_CLIENT_SECRET: 'synthetic-startup-strava-secret',
    STRAVA_REDIRECT_URI: `https://127.0.0.1:${port}/strava/callback`,
    STRAVA_CREDENTIAL_STORE: 'standalone', MCP_CREDENTIAL_ENCRYPTION_KEY: key,
    TRUSTED_PROXY_MODE: 'azure-app-service',
  };
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'X-Forwarded-Proto': 'https' };
  let output = '';
  const launch = encryptionKey => {
    child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/index.js'], {
      cwd: extracted, env: { ...env, MCP_CREDENTIAL_ENCRYPTION_KEY: encryptionKey }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
  };
  const healthy = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, 'Packaged startup exited before health became available');
      try {
        const response = await fetch(base + '/health', { headers, signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          assert.deepEqual(await response.json(), { status: 'ok' });
          return;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Packaged process never became healthy');
  };
  launch(key);
  await healthy();
  assert.equal((await pool.query("SELECT to_regclass('runcoach_mcp.credentials') AS credentials")).rows[0].credentials, 'runcoach_mcp.credentials',
    'npm start command must automatically bootstrap schema on an empty standalone database');
  const metadata = await fetch(base + '/.well-known/oauth-authorization-server', { headers });
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).issuer, env.MCP_PUBLIC_URL);
  const unauthenticated = await fetch(base + '/mcp', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(unauthenticated.status, 401);
  assert.ok(unauthenticated.headers.get('www-authenticate').includes('oauth-protected-resource/mcp'));
  const store = new PgStore(pool, { storageMode: 'standalone', credentialEncryptionKey: key });
  await store.authorizeCredentials(async () => ({
    athleteId: 7, credentials: { access_token: 'synthetic-packaged-access', refresh_token: 'synthetic-packaged-refresh', expires_at: 123 },
  }));
  const before = (await pool.query('SELECT * FROM runcoach_mcp.credentials')).rows;
  await stop();
  launch(key);
  await healthy();
  await stop();
  output = '';
  launch(randomBytes(32).toString('base64'));
  const [code] = await once(child, 'exit');
  assert.equal(code, 1, 'A valid-format replacement key must fail before binding the listener');
  assert.ok(output.includes('MCP startup failed'));
  assert.equal(output.includes('RunCoach MCP server ready'), false);
  assert.equal(output.includes(key), false);
  assert.equal(output.includes('synthetic-packaged-access'), false);
  await assert.rejects(fetch(base + '/health', { headers, signal: AbortSignal.timeout(1000) }));
  assert.deepEqual((await pool.query('SELECT * FROM runcoach_mcp.credentials')).rows, before,
    'Wrong-key startup must preserve existing encrypted credentials');
  assert.equal((await pool.query("SELECT to_regclass('public.users') AS users")).rows[0].users, null);
});
