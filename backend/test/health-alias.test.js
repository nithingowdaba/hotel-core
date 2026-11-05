'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
// Keep this route contract test independent of an installed MySQL service.
require('../src/config/db').checkConnection = async () => false;
const app = require('../app');

test('health liveness and readiness work at both documented prefixes', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const route of ['/health', '/api/health']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, 'ok');
  }

  let readiness;
  for (const route of ['/health/ready', '/api/health/ready']) {
    const response = await fetch(`${base}${route}`);
    assert.ok([200, 503].includes(response.status));
    const body = await response.json();
    assert.equal(body.success, response.status === 200);
    const signature = { status: response.status, success: body.success, state: body.data?.status || body.error?.code };
    if (readiness) assert.deepEqual(signature, readiness);
    else readiness = signature;
  }
});
