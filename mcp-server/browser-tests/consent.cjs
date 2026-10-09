const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.MCP_BROWSER_TEST_MODULE);

(async () => {
  const { createApp } = await import('../src/app.js');
  const callback = http.createServer((_req, res) => res.end('OAuth callback reached'));
  callback.listen(0, '127.0.0.1');
  await once(callback, 'listening');
  const redirectUri = `http://127.0.0.1:${callback.address().port}/callback`;
  const decisions = [];
  const config = {
    publicUrl: 'http://127.0.0.1', production: false, origins: [],
    redirects: [redirectUri], storageMode: 'shared',
  };
  const store = {
    stravaCallback: async () => ({ athleteId: 7, csrf: 'browser-test-csrf' }),
    consent: async (request, _browserHash, csrf, allow) => {
      assert.equal(request, 'browser-test-request');
      assert.equal(csrf, 'browser-test-csrf');
      decisions.push(allow);
      return { data: { redirectUri, state: 'browser-test-state' },
        ...(allow ? { code: 'browser-test-code' } : {}) };
    },
  };
  const server = createApp({ config, store, strava: {} }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  config.publicUrl = `http://127.0.0.1:${server.address().port}`;
  config.origins.push(config.publicUrl);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const allow of [true, false]) {
      const context = await browser.newContext();
      try {
        await context.addCookies([{ name: 'mcp_browser', value: 'browser-test-cookie', url: config.publicUrl }]);
        const page = await context.newPage();
        await page.goto(`${config.publicUrl}/strava/callback?state=browser-test-request&code=test&scope=read,activity:read_all,profile:read_all`);
        await Promise.all([
          page.waitForURL(url => url.origin === new URL(redirectUri).origin, { timeout: 15_000 }),
          page.getByRole('button', { name: allow ? 'Allow' : 'Deny', exact: true }).click(),
        ]);
        const url = new URL(page.url());
        assert.equal(url.pathname, '/callback');
        assert.equal(url.searchParams.get('state'), 'browser-test-state');
        assert.equal(url.searchParams.get('iss'), config.publicUrl);
        assert.equal(url.searchParams.get(allow ? 'code' : 'error'), allow ? 'browser-test-code' : 'access_denied');
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(decisions, [true, false]);
    console.log('Chromium consent Allow and Deny reach the configured cross-origin OAuth callback.');
  } finally {
    if (browser) await browser.close();
    await Promise.all([server, callback].map(s => new Promise(resolve => s.close(resolve))));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
