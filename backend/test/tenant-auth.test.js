'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { after, before, test } = require('node:test');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
process.env.DB_NAME = 'hotel_core_test';

const databaseName = process.env.DB_NAME || '';
if (!/_test$/.test(databaseName)) {
  throw new Error('Auth database tests refused to run: DB_NAME must end in _test.');
}
for (const variable of ['DB_HOST', 'DB_PORT', 'DB_USER']) {
  if (!process.env[variable]) throw new Error(`Auth database tests require ${variable}.`);
}
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('Auth database tests require DB_PASSWORD (it may be empty for a local test account).');
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-hotel-core-secret-0123456789';
process.env.DB_POOL_SIZE = process.env.DB_POOL_SIZE || '10';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { applySchema } = require('../scripts/db-schema');
const app = require('../app');
const { resolveHotel, requireHotelAdmin } = require('../src/middleware/tenant');

let connection;
let server;
let baseUrl;
let customerId;
let adminId;
let platformAdminId;
let customerToken;
let passwordHash;

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Unsafe test database identifier.');
  return `\`${value}\``;
}

function connectionOptions() {
  const options = {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    multipleStatements: true,
  };
  if (process.env.DB_SOCKET_PATH) {
    delete options.host;
    delete options.port;
    options.socketPath = process.env.DB_SOCKET_PATH;
  }
  return options;
}

function tokenFor(userId, extra = {}) {
  return jwt.sign({ ...extra, sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: 'hotel-core',
    expiresIn: '1h',
  });
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, options);
}

async function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error || null));
  });
}

before(async () => {
  connection = await mysql.createConnection(connectionOptions());
  const dbName = quoteIdentifier(databaseName);
  await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await connection.query(`CREATE DATABASE ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.query(`USE ${dbName}`);
  await applySchema(connection, databaseName);

  passwordHash = await bcrypt.hash('Correct-test-password-01', 12);
  const [customer] = await connection.execute(
    `INSERT INTO users (full_name, email, phone, password_hash)
     VALUES (?, ?, ?, ?)`,
    ['Test Customer', 'customer@example.test', '1000000001', passwordHash],
  );
  customerId = customer.insertId;
  const [admin] = await connection.execute(
    `INSERT INTO users (full_name, email, phone, password_hash)
     VALUES (?, ?, ?, ?)`,
    ['Hotel Admin', 'hotel-admin@example.test', '1000000002', passwordHash],
  );
  adminId = admin.insertId;
  const [platformAdmin] = await connection.execute(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, 'PLATFORM_ADMIN')`,
    ['Platform Admin', 'platform-admin@example.test', '1000000003', passwordHash],
  );
  platformAdminId = platformAdmin.insertId;
  await connection.execute(
    `INSERT INTO hotels (id, name, slug, status) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    [1, 'Test Hotel', 'test-hotel', 'active', 2, 'Suspended Hotel', 'suspended-hotel', 'suspended'],
  );
  await connection.execute('INSERT INTO hotel_members (user_id, hotel_id) VALUES (?, ?)', [adminId, 1]);
  customerToken = tokenFor(customerId);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db.getPool) await db.getPool().end();
  if (connection) await connection.end();
});

test('registration normalizes email, ignores role, and rejects duplicate email', async (t) => {
  await t.test('creates a CUSTOMER even when role is submitted', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: 'New User', email: ' New.User@Example.Test ', phone: '1000000099',
        password: 'new-test-password', role: 'PLATFORM_ADMIN',
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.email, 'new.user@example.test');
    assert.equal(body.data.role, 'CUSTOMER');
    const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [body.data.id]);
    assert.equal(rows[0].role, 'CUSTOMER');
  });

  await t.test('returns EMAIL_IN_USE for duplicate email', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Duplicate', email: 'CUSTOMER@example.test', phone: '1000000000',
        password: 'another-test-password',
      }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'EMAIL_IN_USE');
  });
});

test('login errors are generic and inactive users and stale tokens are rejected', async (t) => {
  await t.test('unknown user and wrong password receive the same error', async () => {
    const bodies = [];
    for (const email of ['missing@example.test', 'customer@example.test']) {
      const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
      assert.equal(response.status, 401);
      bodies.push((await response.json()).error);
    }
    assert.equal(bodies[0].code, bodies[1].code);
    assert.equal(bodies[0].message, bodies[1].message);
  });

  await t.test('inactive account cannot log in or use a token issued before deactivation', async () => {
    const oldToken = customerToken;
    await connection.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [customerId]);
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'customer@example.test', password: 'Correct-test-password-01' }),
    });
    assert.equal(login.status, 401);
    const me = await request('/api/auth/me', { headers: { authorization: `Bearer ${oldToken}` } });
    assert.equal(me.status, 401);
    await connection.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [customerId]);
  });
});

test('JWT issuer, expiration, signature, and active user are checked from the database', async () => {
  const invalidTokens = [
    jwt.sign({ sub: String(customerId) }, process.env.JWT_SECRET, { issuer: 'wrong-issuer', expiresIn: '1h' }),
    jwt.sign({ sub: String(customerId), exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET, { issuer: 'hotel-core' }),
    `${customerToken.slice(0, -1)}x`,
  ];
  for (const token of invalidTokens) {
    const response = await request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
  }
});

test('GET /auth/me returns memberships and never returns password_hash', async () => {
  const response = await request('/api/auth/me', {
    headers: { authorization: `Bearer ${tokenFor(adminId)}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.admin_of, [{ hotel_id: 1, name: 'Test Hotel', slug: 'test-hotel' }]);
  assert.equal(Object.hasOwn(body.data, 'password_hash'), false);
});

test('platform admin CLI creates an account that can log in', async () => {
  const script = path.resolve(__dirname, '..', 'scripts', 'create-platform-admin.js');
  const password = 'cli-test-password-01';
  const result = spawnSync(process.execPath, [
    script, 'cli-admin@example.test', 'CLI Test Admin', '1000000004', password,
  ], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, 'admin CLI should exit successfully');
  assert.equal(`${result.stdout}${result.stderr}`.includes(password), false, 'admin CLI must not echo its password');

  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cli-admin@example.test', password }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.user.role, 'PLATFORM_ADMIN');
  assert.ok(body.data.token);
});

test('tenant middleware resolves only URL params and enforces hotel membership', async (t) => {
  await t.test('unknown hotel returns HOTEL_NOT_FOUND', async () => {
    const error = await runMiddleware(resolveHotel, {
      params: { hotelId: '9999' }, method: 'GET', body: { hotelId: 1 }, query: { hotelId: 1 },
    });
    assert.equal(error.code, 'HOTEL_NOT_FOUND');
    assert.equal(error.statusCode, 404);
  });

  await t.test('suspended hotel writes fail while platform admins can read', async () => {
    const writeError = await runMiddleware(resolveHotel, { params: { hotelId: '2' }, method: 'POST' });
    assert.equal(writeError.code, 'HOTEL_SUSPENDED');
    const readError = await runMiddleware(resolveHotel, { params: { hotelId: '2' }, method: 'GET' });
    assert.equal(readError.code, 'HOTEL_NOT_FOUND');
    const platformRequest = {
      params: { hotelId: '2' }, method: 'GET', user: { role: 'PLATFORM_ADMIN' },
    };
    const platformReadError = await new Promise((resolve) => resolveHotel(
      platformRequest, {}, (error) => resolve(error || null),
    ));
    assert.equal(platformReadError, null);
    assert.equal(Number(platformRequest.hotel.id), 2);
  });

  await t.test('body and query hotel ids do not affect resolution', async () => {
    let req;
    await new Promise((resolve) => {
      req = { params: { hotelId: '1' }, body: { hotelId: 2 }, query: { hotelId: 2 }, method: 'GET' };
      resolveHotel(req, {}, resolve);
    });
    assert.equal(Number(req.hotel.id), 1);
  });

  await t.test('members and platform admins pass; non-members do not', async () => {
    const memberError = await runMiddleware(requireHotelAdmin, {
      user: { id: adminId, role: 'CUSTOMER' }, hotel: { id: 1 },
    });
    assert.equal(memberError, null);
    const nonMemberError = await runMiddleware(requireHotelAdmin, {
      user: { id: customerId, role: 'CUSTOMER' }, hotel: { id: 1 },
    });
    assert.equal(nonMemberError.code, 'FORBIDDEN');
    const platformError = await runMiddleware(requireHotelAdmin, {
      user: { id: platformAdminId, role: 'PLATFORM_ADMIN' }, hotel: { id: 1 },
    });
    assert.equal(platformError, null);
  });
});

test('login limiter is per client IP and rejects the eleventh request', async () => {
  let eleventh;
  for (let attempt = 1; attempt <= 11; attempt += 1) {
    eleventh = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.40' },
      body: JSON.stringify({ email: 'missing@example.test', password: 'wrong-password' }),
    });
  }
  assert.equal(eleventh.status, 429);
  assert.equal((await eleventh.json()).error.code, 'RATE_LIMITED');

  const otherIp = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.41' },
    body: JSON.stringify({ email: 'missing@example.test', password: 'wrong-password' }),
  });
  assert.equal(otherIp.status, 401);
});

test('environment validation fails fast without exposing secret values', async (t) => {
  const envPath = path.resolve(__dirname, '..', 'config', 'env.js');
  const sharedEnv = {
    ...process.env,
    DB_HOST: 'localhost', DB_PORT: '3306', DB_USER: 'placeholder-user',
    DB_PASSWORD: 'placeholder-password', DB_NAME: 'hotel_core_test',
    JWT_SECRET: 'test-only-placeholder-secret-long-enough',
  };
  for (const variable of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']) {
    await t.test(`reports missing ${variable} without dumping values`, () => {
      const childEnv = { ...sharedEnv };
      delete childEnv[variable];
      const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', envPath], {
        cwd: '/tmp', env: childEnv, encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, new RegExp(variable));
      assert.equal(`${result.stdout}${result.stderr}`.includes('placeholder-password'), false);
    });
  }

  await t.test('rejects short JWT_SECRET without printing it', () => {
    const sentinel = 'short-test-secret-sentinel';
    const result = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', envPath], {
      cwd: '/tmp',
      env: { ...sharedEnv, JWT_SECRET: sentinel },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /JWT_SECRET must be at least 32 characters/);
    assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
  });
});
