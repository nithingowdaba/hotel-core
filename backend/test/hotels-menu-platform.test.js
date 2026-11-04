'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { before, after, test } = require('node:test');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const databaseName = process.env.DB_NAME || '';
if (!/_test$/.test(databaseName)) {
  throw new Error('Hotel/menu/platform database tests refused to run: DB_NAME must end in _test.');
}
if (!/^[A-Za-z0-9_]+_test$/.test(databaseName)) {
  throw new Error('Hotel/menu/platform database tests refused to run: DB_NAME must be a safe identifier ending in _test.');
}
for (const variable of ['DB_HOST', 'DB_PORT', 'DB_USER']) {
  if (!process.env[variable]) throw new Error(`Hotel/menu/platform database tests require ${variable}.`);
}
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('Hotel/menu/platform database tests require DB_PASSWORD (it may be empty for a local test account).');
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-hotel-core-secret-0123456789';
process.env.DB_POOL_SIZE = process.env.DB_POOL_SIZE || '10';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const { applySchema } = require('../scripts/db-schema');
const app = require('../app');

let connection;
let server;
let baseUrl;
const ids = {};
const tokens = {};

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

function tokenFor(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    issuer: 'hotel-core', expiresIn: '1h',
  });
}

async function request(pathname, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function createUser(fullName, email, role = 'CUSTOMER') {
  const hash = await bcrypt.hash('Test-password-0123', 12);
  const [result] = await connection.execute(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`, [fullName, email, '9000000000', hash, role],
  );
  return result.insertId;
}

before(async () => {
  connection = await mysql.createConnection(connectionOptions());
  const safeName = `\`${databaseName}\``;
  await connection.query(`DROP DATABASE IF EXISTS ${safeName}`);
  await connection.query(`CREATE DATABASE ${safeName} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.query(`USE ${safeName}`);
  await applySchema(connection, databaseName);

  ids.adminA = await createUser('Admin A', 'admin-a@example.test');
  ids.adminB = await createUser('Admin B', 'admin-b@example.test');
  ids.customer = await createUser('Customer C', 'customer-c@example.test');
  ids.platform = await createUser('Platform P', 'platform-p@example.test', 'PLATFORM_ADMIN');
  const [hotelA] = await connection.execute(
    `INSERT INTO hotels (name, slug, status) VALUES ('Hotel A', 'hotel-a', 'active')`,
  );
  const [hotelB] = await connection.execute(
    `INSERT INTO hotels (name, slug, status) VALUES ('Hotel B', 'hotel-b', 'active')`,
  );
  ids.hotelA = hotelA.insertId;
  ids.hotelB = hotelB.insertId;
  await connection.execute('INSERT INTO hotel_members (user_id, hotel_id) VALUES (?, ?), (?, ?)', [
    ids.adminA, ids.hotelA, ids.adminB, ids.hotelB,
  ]);
  const [itemA] = await connection.execute(
    `INSERT INTO menu_items (hotel_id, name, category, price, is_veg, is_available)
     VALUES (?, 'Dosa', 'Breakfast', 50.00, TRUE, TRUE)`, [ids.hotelA],
  );
  const [itemUnavailable] = await connection.execute(
    `INSERT INTO menu_items (hotel_id, name, category, price, is_veg, is_available)
     VALUES (?, 'Pongal', 'Breakfast', 60.00, TRUE, FALSE)`, [ids.hotelA],
  );
  const [itemNonVeg] = await connection.execute(
    `INSERT INTO menu_items (hotel_id, name, category, price, is_veg, is_available)
     VALUES (?, 'Egg Curry', 'Dinner', 120.00, FALSE, TRUE)`, [ids.hotelA],
  );
  const [itemB] = await connection.execute(
    `INSERT INTO menu_items (hotel_id, name, category, price, is_veg, is_available)
     VALUES (?, 'Biryani', 'Dinner', 180.00, FALSE, TRUE)`, [ids.hotelB],
  );
  ids.itemA = itemA.insertId;
  ids.itemUnavailable = itemUnavailable.insertId;
  ids.itemNonVeg = itemNonVeg.insertId;
  ids.itemB = itemB.insertId;
  for (const role of ['adminA', 'adminB', 'customer', 'platform']) tokens[role] = tokenFor(ids[role]);

  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      if (!server.address()) return reject(new Error('Test HTTP server could not bind a local port.'));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.once('error', reject);
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db.getPool) await db.getPool().end();
  if (connection) await connection.end();
});

test('hotel menu APIs scope reads to the URL tenant and expose availability and veg filters', async () => {
  const grouped = await request(`/api/hotels/${ids.hotelA}/menu`);
  assert.equal(grouped.status, 200);
  const categories = (await grouped.json()).data.categories;
  const menu = categories.flatMap((category) => category.items);
  assert.equal(menu.some((item) => item.id === ids.itemB), false);
  assert.equal(menu.find((item) => item.id === ids.itemUnavailable).is_available, false);

  const veg = await request(`/api/hotels/${ids.hotelA}/menu?veg=true`);
  const vegItems = (await veg.json()).data.categories.flatMap((category) => category.items);
  assert.ok(vegItems.every((item) => Boolean(item.is_veg)));

  const wrongTenant = await request(`/api/hotels/${ids.hotelA}/menu-items/${ids.itemB}`);
  assert.equal(wrongTenant.status, 404);
  assert.equal((await wrongTenant.json()).error.code, 'MENU_ITEM_NOT_FOUND');
});

test('hotel administration enforces authentication, membership, validation, and uniqueness', async () => {
  const noToken = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
    method: 'POST', body: { name: 'Soup', category: 'Dinner', price: '40.00' },
  });
  assert.equal(noToken.status, 401);

  const customer = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
    method: 'POST', token: tokens.customer,
    body: { name: 'Soup', category: 'Dinner', price: '40.00' },
  });
  assert.equal(customer.status, 403);

  const crossHotel = await request(`/api/hotels/${ids.hotelB}/menu-items/${ids.itemB}`, {
    method: 'PATCH', token: tokens.adminA, body: { name: 'Changed' },
  });
  assert.equal(crossHotel.status, 403);

  const crossHotelCreate = await request(`/api/hotels/${ids.hotelB}/menu-items`, {
    method: 'POST', token: tokens.adminA,
    body: { name: 'Unauthorized', category: 'Other', price: '40.00' },
  });
  assert.equal(crossHotelCreate.status, 403);

  const crossHotelProfile = await request(`/api/hotels/${ids.hotelB}`, {
    method: 'PATCH', token: tokens.adminA, body: { description: 'Unauthorized edit' },
  });
  assert.equal(crossHotelProfile.status, 403);

  const adminsAsHotelAdmin = await request(`/api/platform/hotels/${ids.hotelB}/admins`, {
    token: tokens.adminA,
  });
  assert.equal(adminsAsHotelAdmin.status, 403);

  const duplicate = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
    method: 'POST', token: tokens.adminA,
    body: { name: 'Dosa', category: 'Breakfast', price: '80.00' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'MENU_ITEM_EXISTS');

  for (const price of [0, -1, 'not-money']) {
    const invalid = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
      method: 'POST', token: tokens.adminA,
      body: { name: `Bad ${price}`, category: 'Other', price },
    });
    assert.equal(invalid.status, 400);
  }
  const invalidImage = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
    method: 'POST', token: tokens.adminA,
    body: { name: 'Bad image', category: 'Other', price: '1.00', image_url: 'http://example.test/dish.png' },
  });
  assert.equal(invalidImage.status, 400);
  const invalidBoolean = await request(`/api/hotels/${ids.hotelA}/menu-items`, {
    method: 'POST', token: tokens.adminA,
    body: { name: 'Bad bool', category: 'Other', price: '1.00', is_available: 'true' },
  });
  assert.equal(invalidBoolean.status, 400);
});

test('platform hotel and administrator management supports both linking modes', async () => {
  const created = await request('/api/platform/hotels', {
    method: 'POST', token: tokens.platform,
    body: { name: 'New Hotel & Cafe', cuisines: 'South Indian' },
  });
  assert.equal(created.status, 201);
  const hotel = (await created.json()).data;
  assert.equal(hotel.slug, 'new-hotel-cafe');

  const duplicate = await request('/api/platform/hotels', {
    method: 'POST', token: tokens.platform, body: { name: 'Another Name', slug: hotel.slug },
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'SLUG_IN_USE');

  const pool = db.getPool();
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => {
    const transactionConnection = await originalGetConnection();
    return {
      beginTransaction: transactionConnection.beginTransaction.bind(transactionConnection),
      commit: transactionConnection.commit.bind(transactionConnection),
      rollback: transactionConnection.rollback.bind(transactionConnection),
      release: transactionConnection.release.bind(transactionConnection),
      execute(sql, params) {
        if (/^\s*INSERT INTO hotel_members/i.test(sql)) {
          const error = new Error('forced membership insert failure');
          error.code = 'ER_TEST_FORCED';
          throw error;
        }
        return transactionConnection.execute(sql, params);
      },
    };
  };
  try {
    const originalConsoleError = console.error;
    let failedAdmin;
    try {
      console.error = () => {};
      failedAdmin = await request(`/api/platform/hotels/${hotel.id}/admins`, {
        method: 'POST', token: tokens.platform,
        body: {
          full_name: 'Orphan Candidate', email: 'orphan-candidate@example.test',
          phone: '9000000003', password: 'Test-password-0123',
        },
      });
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(failedAdmin.status, 500);
    const [orphan] = await connection.execute(
      'SELECT id FROM users WHERE email = ?', ['orphan-candidate@example.test'],
    );
    assert.equal(orphan.length, 0);
  } finally {
    pool.getConnection = originalGetConnection;
  }

  const newAdmin = await request(`/api/platform/hotels/${hotel.id}/admins`, {
    method: 'POST', token: tokens.platform,
    body: { full_name: 'Created Admin', email: 'created-admin@example.test', phone: '9000000001', password: 'Test-password-0123' },
  });
  assert.equal(newAdmin.status, 201);
  const createdAdmin = (await newAdmin.json()).data;
  const [createdUser] = await connection.execute('SELECT role FROM users WHERE id = ?', [createdAdmin.id]);
  assert.equal(createdUser[0].role, 'CUSTOMER');

  const mixed = await request(`/api/platform/hotels/${hotel.id}/admins`, {
    method: 'POST', token: tokens.platform,
    body: { user_id: ids.customer, full_name: 'Mixed', email: 'mixed@example.test', phone: '9000000002', password: 'Test-password-0123' },
  });
  assert.equal(mixed.status, 400);

  const link = await request(`/api/platform/hotels/${hotel.id}/admins`, {
    method: 'POST', token: tokens.platform, body: { user_id: ids.customer },
  });
  assert.equal(link.status, 201);
  const duplicateLink = await request(`/api/platform/hotels/${hotel.id}/admins`, {
    method: 'POST', token: tokens.platform, body: { user_id: ids.customer },
  });
  assert.equal(duplicateLink.status, 409);
  assert.equal((await duplicateLink.json()).error.code, 'ALREADY_HOTEL_ADMIN');

  const removed = await request(`/api/platform/hotels/${hotel.id}/admins/${ids.customer}`, {
    method: 'DELETE', token: tokens.platform,
  });
  assert.equal(removed.status, 200);
  const [remainingUser] = await connection.execute('SELECT id FROM users WHERE id = ?', [ids.customer]);
  assert.equal(remainingUser.length, 1);
});

test('suspended hotels are hidden publicly and reject admin writes while platform can read', async () => {
  await connection.execute('UPDATE hotels SET status = \'suspended\' WHERE id = ?', [ids.hotelB]);
  const publicHotel = await request(`/api/hotels/${ids.hotelB}`);
  assert.equal(publicHotel.status, 404);
  const publicList = await request('/api/hotels');
  assert.equal((await publicList.json()).data.some((hotel) => hotel.id === ids.hotelB), false);

  const write = await request(`/api/hotels/${ids.hotelB}/menu-items/${ids.itemB}`, {
    method: 'PATCH', token: tokens.adminB, body: { name: 'Blocked' },
  });
  assert.equal(write.status, 403);
  assert.equal((await write.json()).error.code, 'HOTEL_SUSPENDED');

  const platformHotels = await request('/api/platform/hotels', { token: tokens.platform });
  assert.equal(platformHotels.status, 200);
  assert.ok((await platformHotels.json()).data.some((hotel) => hotel.id === ids.hotelB && hotel.status === 'suspended'));
});

test('non-platform users cannot access platform administration', async () => {
  const response = await request('/api/platform/hotels', { token: tokens.customer });
  assert.equal(response.status, 403);
});

test('orders, customer history, hotel transitions, reports, and metrics enforce scope', async () => {
  const created = await request(`/api/hotels/${ids.hotelA}/orders`, {
    method: 'POST', token: tokens.customer,
    body: { payment_method: 'upi', items: [
      { menu_item_id: ids.itemA, quantity: 2 }, { menu_item_id: ids.itemA, quantity: 1 },
    ] },
  });
  assert.equal(created.status, 201);
  const order = (await created.json()).data;
  assert.equal(order.total_amount, '150.00');
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 3);

  const own = await request('/api/me/orders', { token: tokens.customer });
  assert.equal(own.status, 200);
  assert.ok((await own.json()).data.some((item) => item.id === order.id));
  const hidden = await request(`/api/me/orders/${order.id}`, { token: tokens.adminA });
  assert.equal(hidden.status, 404);

  const wrongTenant = await request(`/api/hotels/${ids.hotelB}/orders/${order.id}`, { token: tokens.adminB });
  assert.equal(wrongTenant.status, 404);
  const complete = await request(`/api/hotels/${ids.hotelA}/orders/${order.id}/status`, {
    method: 'PATCH', token: tokens.adminA, body: { status: 'completed' },
  });
  assert.equal(complete.status, 200);

  const date = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sales = await request(`/api/hotels/${ids.hotelA}/reports/daily-sales?date=${date}`, { token: tokens.adminA });
  assert.equal(sales.status, 200);
  assert.equal((await sales.json()).data.completed_order_count, 1);
  const top = await request(`/api/hotels/${ids.hotelA}/reports/top-selling-items?from=${date}&to=${date}`, { token: tokens.adminA });
  assert.equal(top.status, 200);
  assert.equal((await top.json()).data[0].quantity_sold, 3);

  const invalidFields = await request(`/api/hotels/${ids.hotelA}/orders`, {
    method: 'POST', token: tokens.customer,
    body: { payment_method: 'cash', items: [{ menu_item_id: ids.itemA, quantity: 1, price: 0 }] },
  });
  assert.equal(invalidFields.status, 400);
  const cancellation = await request(`/api/me/orders/${order.id}/cancel`, { method: 'PATCH', token: tokens.customer });
  assert.equal(cancellation.status, 409);

  const metrics = await request('/api/platform/metrics', { token: tokens.platform });
  assert.equal(metrics.status, 200);
  assert.ok((await metrics.json()).data.routes.some((route) => route.route.includes('/api/hotels/:hotelId/orders')));
});
