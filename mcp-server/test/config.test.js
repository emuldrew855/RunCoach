import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../src/config.js';

const env = {
  MCP_PUBLIC_URL: 'https://mcp.example.com',
  MCP_REDIRECT_URIS: 'https://chatgpt.com/callback',
  STRAVA_REDIRECT_URI: 'https://mcp.example.com/strava/callback',
  DATABASE_URL: 'postgresql://localhost/runcoach',
  MCP_CLIENT_ID: 'test-client', MCP_CLIENT_SECRET: 'test-secret',
  STRAVA_CLIENT_ID: 'test-strava', STRAVA_CLIENT_SECRET: 'test-strava-secret',
};

test('configuration preserves shared storage and local listener defaults', () => {
  const config = loadConfig(env);
  assert.equal(config.storageMode, 'shared');
  assert.equal(config.credentialEncryptionKey, undefined);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3002);
  assert.equal(config.trustedProxy, 'loopback');
  assert.equal(config.production, true);
});

test('standalone requires a canonical 32-byte base64 encryption key', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  const config = loadConfig({ ...env, STRAVA_CREDENTIAL_STORE: 'standalone', MCP_CREDENTIAL_ENCRYPTION_KEY: key });
  assert.deepEqual(config.credentialEncryptionKey, Buffer.alloc(32, 1));
  for (const invalid of [undefined, '', 'not-base64', key.slice(0, -1), key + '\n',
    Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), key.slice(0, -2) + 'F=']) {
    assert.throws(() => loadConfig({ ...env, STRAVA_CREDENTIAL_STORE: 'standalone', MCP_CREDENTIAL_ENCRYPTION_KEY: invalid }));
  }
  assert.throws(() => loadConfig({ ...env, STRAVA_CREDENTIAL_STORE: 'other' }));
});

test('shared callback relay requires an exact configured HTTPS origin and fixed route', () => {
  const relay = 'https://runcoach.example.com';
  const settings = { ...env, STRAVA_CALLBACK_RELAY_ORIGIN: relay,
    STRAVA_REDIRECT_URI: `${relay}/api/v1/auth/strava/mcp/callback` };
  assert.equal(loadConfig(settings).stravaRedirect, settings.STRAVA_REDIRECT_URI);
  for (const invalid of ['http://runcoach.example.com', relay + '/', relay + '/path',
    relay + '?x=1', 'https://user@runcoach.example.com']) {
    assert.throws(() => loadConfig({ ...settings, STRAVA_CALLBACK_RELAY_ORIGIN: invalid }));
  }
  assert.throws(() => loadConfig({ ...settings, STRAVA_REDIRECT_URI: relay + '/api/v1/auth/strava/callback' }));
  assert.throws(() => loadConfig({ ...settings, STRAVA_CALLBACK_RELAY_ORIGIN: undefined }));
  assert.throws(() => loadConfig({ ...settings, STRAVA_CREDENTIAL_STORE: 'standalone',
    MCP_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }));
});

test('Azure managed ingress requires explicit bounded proxy mode', () => {
  const config = loadConfig({ ...env, HOST: '0.0.0.0', PORT: '8080', TRUSTED_PROXY_MODE: 'azure-app-service' });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8080);
  assert.equal(config.trustedProxy, 1);
  for (const mode of ['true', '2', 'other']) assert.throws(() => loadConfig({ ...env, TRUSTED_PROXY_MODE: mode }));
  assert.throws(() => loadConfig({ ...env, TRUSTED_PROXY_CIDRS: '10.0.0.0/24' }));
});

test('known ingress CIDRs are validated and explicit', () => {
  const config = loadConfig({ ...env, TRUSTED_PROXY_MODE: 'cidrs', TRUSTED_PROXY_CIDRS: '10.0.0.0/24, fd00::/64' });
  assert.deepEqual(config.trustedProxy, ['10.0.0.0/24', 'fd00::/64']);
  for (const cidrs of [undefined, '', ',', 'loopback', '10.0.0.0/33', 'fd00::/129', '10.0.0.0/-1', '10.0.0.0/', '10.0.0.0/24/1']) {
    assert.throws(() => loadConfig({ ...env, TRUSTED_PROXY_MODE: 'cidrs', TRUSTED_PROXY_CIDRS: cidrs }));
  }
});

test('public URL remains an exact HTTPS origin in production', () => {
  for (const url of ['http://mcp.example.com', 'https://mcp.example.com/path', 'https://mcp.example.com?x=1',
    'https://user@mcp.example.com', 'https://mcp.example.com#fragment']) {
    assert.throws(() => loadConfig({ ...env, MCP_PUBLIC_URL: url }));
  }
  const config = loadConfig({ ...env, NODE_ENV: 'development', MCP_PUBLIC_URL: 'http://localhost:3002',
    STRAVA_REDIRECT_URI: 'http://localhost:3002/strava/callback' });
  assert.equal(config.production, false);
  for (const port of ['invalid', '0', '65536', '3002.5']) assert.throws(() => loadConfig({ ...env, PORT: port }));
});

test('startup migrates before listening and verifies only the selected credential store', () => {
  // Isolate startup dependencies in a child process without opening a database.
  const script = `
    import { registerHooks } from 'node:module';
    const replacements = {
      'database.js': "export function createDatabasePool() { return { on() {}, async query(sql) { console.log('QUERY:' + sql); }, async end() { console.log('POOL_END'); } }; }",
      'store.js': "export class PgStore { constructor(pool, options) { this.pool = pool; this.options = options; console.log('STORE:' + options.storageMode + ':' + (options.credentialEncryptionKey?.length || 0)); } async initialize() { console.log('INITIALIZE'); if (process.env.FAIL_INITIALIZE) throw new Error('test initialization failure'); await this.pool.query('SELECT * FROM ' + (this.options.storageMode === 'shared' ? 'public.users' : 'runcoach_mcp.credentials')); } }",
      'migrate.js': "export async function migrate(pool, options) { console.log('MIGRATE:' + options.storageMode); if (process.env.FAIL_MIGRATION) throw new Error('test migration failure'); }",
      'app.js': "export function createApp() { return { listen(port, host, ready) { console.log('LISTEN:' + host + ':' + port); ready(); return { on() {}, close() {} }; } }; }",
    };
    registerHooks({
      load(url, context, nextLoad) {
        const replacement = replacements[url.split('/').pop()];
        if (replacement) return { format: 'module', source: replacement, shortCircuit: true };
        return nextLoad(url, context);
      },
    });
    await import(${JSON.stringify(new URL('../src/index.js', import.meta.url).href)});
  `;
  for (const storageMode of ['shared', 'standalone']) {
    const childEnv = { ...env, NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080',
      STRAVA_CREDENTIAL_STORE: storageMode, MCP_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: childEnv, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`STORE:${storageMode}:${storageMode === 'standalone' ? 32 : 0}`));
    assert.ok(result.stdout.indexOf(`MIGRATE:${storageMode}`) < result.stdout.indexOf('INITIALIZE'));
    assert.ok(result.stdout.indexOf('INITIALIZE') < result.stdout.indexOf('LISTEN:'));
    assert.ok(result.stdout.includes('LISTEN:0.0.0.0:8080'));
    assert.equal(result.stdout.includes('FROM public.users'), storageMode === 'shared');
    assert.equal(result.stdout.includes('FROM runcoach_mcp.credentials'), storageMode === 'standalone');
    for (const failure of ['FAIL_MIGRATION', 'FAIL_INITIALIZE']) {
      const failed = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...childEnv, [failure]: '1' }, encoding: 'utf8',
      });
      assert.equal(failed.status, 1);
      assert.ok(failed.stdout.includes('POOL_END'));
      assert.ok(!failed.stdout.includes('LISTEN:'));
      assert.ok(!failed.stderr.includes('test migration failure') && !failed.stderr.includes('test initialization failure'),
        'Startup does not expose database errors');
    }
  }
});
