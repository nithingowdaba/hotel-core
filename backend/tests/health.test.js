'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Start the app without connecting to a real DB for health liveness test
let server;
let baseUrl;

before(async () => {
  // Set required env vars before loading modules
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_secret_hotel_core_testing_only';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_USER = 'test';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'test';
  process.env.PORT = '0'; // OS assigns a random free port

  const app = require('../app');
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.ok(body.data.timestamp);
  });
});

describe('GET /health/ready', () => {
  it('returns 200 or 503 (DB may not be running in CI)', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    assert.ok([200, 503].includes(res.status), `Expected 200 or 503, got ${res.status}`);
    const body = await res.json();
    assert.equal(typeof body.success, 'boolean');
  });
});

describe('GET /unknown-route', () => {
  it('returns 404 with NOT_FOUND code', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
