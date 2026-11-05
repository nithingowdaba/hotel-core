'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const dist = path.resolve(__dirname, '../../frontend/dist');
const createdDist = !fs.existsSync(dist);
if (createdDist) {
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body>test-shell</body></html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-hash.js'), 'test-asset');
}
const app = require('../app');

test('frontend shell, deep links, API 404, cache and CSP headers', async (t) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    await once(server, 'close');
    if (createdDist) fs.rmSync(dist, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(`${base}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /test-shell|id="root"/);
  assert.equal(root.headers.get('cache-control'), 'no-cache');
  const deep = await fetch(`${base}/hotel/1`);
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /test-shell|id="root"/);
  const assetName = fs.readdirSync(path.join(dist, 'assets')).find((name) => name.endsWith('.js'));
  assert.ok(assetName, 'the frontend build should contain a JavaScript asset');
  const asset = await fetch(`${base}/assets/${assetName}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const api404 = await fetch(`${base}/api/does-not-exist`);
  assert.equal(api404.status, 404);
  assert.equal((await api404.json()).error.code, 'NOT_FOUND');
  const csp = root.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /img-src 'self' https: data:/);
  assert.match(csp, /connect-src 'self'/);
});
