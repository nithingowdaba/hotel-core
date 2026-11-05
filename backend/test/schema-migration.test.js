'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
process.env.DB_NAME = 'hotel_core_test';

const databaseName = process.env.DB_NAME || '';
if (!/_test$/.test(databaseName)) {
  throw new Error('Database tests refused to run: set DB_NAME to a dedicated database ending in _test.');
}
for (const variable of ['DB_HOST', 'DB_USER']) {
  if (!process.env[variable]) throw new Error(`Database tests require ${variable}.`);
}
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('Database tests require DB_PASSWORD (it may be empty if the test account has no password).');
}

const { runMigration, runOnboardingMigration } = require('../scripts/migrate');
const { initDatabase } = require('../scripts/init-db');
const { SCHEMA_PATH } = require('../scripts/db-schema');
const { seedDatabase } = require('../scripts/seed-db');

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error('Unsafe test database identifier.');
  return `\`${identifier}\``;
}

function connectionOptions() {
  const options = {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
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

async function resetDatabase(connection) {
  const name = quoteIdentifier(databaseName);
  await connection.query(`DROP DATABASE IF EXISTS ${name}`);
  await connection.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.query(`USE ${name}`);
}

async function installOldSchema(connection) {
  await resetDatabase(connection);
  await connection.query(`
    CREATE TABLE users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(20) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('CUSTOMER','ADMIN') NOT NULL DEFAULT 'CUSTOMER',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    CREATE TABLE menu_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT NULL,
      category VARCHAR(80) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_menu_category (category),
      KEY idx_menu_available (is_available)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    CREATE TABLE orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      customer_name VARCHAR(120) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      payment_method VARCHAR(32) NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
      cancelled_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_orders_status_created (status, created_at),
      KEY idx_orders_created (created_at),
      KEY idx_orders_user_id (user_id),
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    CREATE TABLE order_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      menu_item_id BIGINT UNSIGNED NOT NULL,
      item_name VARCHAR(120) NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      quantity INT UNSIGNED NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL,
      KEY idx_order_items_menu (menu_item_id),
      CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  `);

  await connection.execute(
    `INSERT INTO users (id, full_name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [7, 'Legacy Admin', 'legacy-admin@example.test', '+910000000007', 'hash-placeholder', 'ADMIN'],
  );
  await connection.execute(
    `INSERT INTO menu_items (id, name, description, category, price)
     VALUES (?, ?, ?, ?, ?)`,
    [11, 'Legacy Dosa', 'Existing menu row', 'Breakfast', 75.5],
  );
  await connection.execute(
    `INSERT INTO orders (id, user_id, customer_name, phone, payment_method, total_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [13, 7, 'Legacy Admin', '+910000000007', 'cash', 75.5],
  );
  await connection.execute(
    `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [17, 13, 11, 'Legacy Dosa', 75.5, 1, 75.5],
  );
}

test('fresh schema, old-schema migration, and tenant constraints', async (t) => {
  const connection = await mysql.createConnection(connectionOptions());
  try {
    await resetDatabase(connection);
    const schemaPath = path.resolve(__dirname, '..', 'database', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    assert.equal(SCHEMA_PATH, schemaPath, 'installation must use the schema read by this test');
    assert.doesNotMatch(schema, /^\s*(?:CREATE\s+DATABASE|USE\s+)/im, 'schema SQL must not create or switch databases');
    const initialized = await initDatabase({ database: databaseName, logger: { log() {} } });
    assert.equal(initialized.database, databaseName);
    const [[selectedDatabase]] = await connection.query('SELECT DATABASE() AS database_name');
    assert.equal(selectedDatabase.database_name, databaseName);

    await t.test('demo seed is idempotent and preserves unrelated existing records', async () => {
      await seedDatabase({ database: databaseName, logger: { log() {} } });
      const [[hotel]] = await connection.execute('SELECT id FROM hotels WHERE slug = ?', ['udupi-hotel']);
      const [userInsert] = await connection.execute(
        `INSERT INTO users (full_name, email, phone, password_hash, role)
         VALUES (?, ?, ?, ?, 'CUSTOMER')`,
        ['Safety Sentinel', 'safety-sentinel@example.test', '+910000000099', 'placeholder-hash'],
      );
      const [orderInsert] = await connection.execute(
        `INSERT INTO orders (hotel_id, user_id, customer_name, phone, payment_method, total_amount)
         VALUES (?, ?, ?, ?, 'cash', 1.00)`,
        [hotel.id, userInsert.insertId, 'Safety Sentinel', '+910000000099'],
      );
      const [[before]] = await connection.execute('SELECT COUNT(*) AS total FROM menu_items');

      await seedDatabase({ database: databaseName, logger: { log() {} } });

      const [[sentinelUser]] = await connection.execute('SELECT id FROM users WHERE id = ?', [userInsert.insertId]);
      const [[sentinelOrder]] = await connection.execute('SELECT id FROM orders WHERE id = ?', [orderInsert.insertId]);
      const [[after]] = await connection.execute('SELECT COUNT(*) AS total FROM menu_items');
      assert.equal(sentinelUser.id, userInsert.insertId);
      assert.equal(sentinelOrder.id, orderInsert.insertId);
      assert.equal(Number(after.total), Number(before.total));
      assert.equal(await fs.readFile(path.resolve(__dirname, '..', 'database', 'seed.sql'), 'utf8'), await fs.readFile(require('../scripts/seed-db').SEED_PATH, 'utf8'));
    });

    await t.test('fresh install creates the six required InnoDB tables and composite keys', async () => {
      const [rows] = await connection.execute(
        `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?`,
        [databaseName],
      );
      assert.deepEqual(rows.map((row) => row.TABLE_NAME).sort(), [
        'hotel_members', 'hotels', 'menu_items', 'order_items', 'orders', 'users',
      ]);
      assert.ok(rows.every((row) => row.ENGINE === 'InnoDB'));
      assert.ok(rows.every((row) => row.TABLE_COLLATION === 'utf8mb4_0900_ai_ci'));

      const [columns] = await connection.execute(
        `SELECT TABLE_NAME, COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?`,
        [databaseName],
      );
      const columnSet = new Set(columns.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
      for (const column of [
        'hotels.cuisines', 'hotels.logo_url', 'hotels.cover_url', 'hotels.accepting_orders',
        'hotels.rejection_reason', 'hotels.submitted_at', 'hotels.approved_at', 'hotels.approved_by',
        'menu_items.is_veg', 'menu_items.image_url', 'menu_items.hotel_id',
        'orders.hotel_id', 'order_items.hotel_id', 'users.is_active',
      ]) {
        assert.ok(columnSet.has(column), `fresh schema must include ${column}`);
      }

      const [keys] = await connection.execute(
        `SELECT TABLE_NAME, CONSTRAINT_NAME
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = ?
           AND CONSTRAINT_NAME IN (
             'fk_oi_order', 'fk_oi_menu', 'chk_menu_price', 'chk_order_total',
             'chk_item_price', 'chk_item_quantity', 'chk_item_subtotal'
           )`,
        [databaseName],
      );
      assert.deepEqual(keys.map((row) => row.CONSTRAINT_NAME).sort(), [
        'chk_item_price', 'chk_item_quantity', 'chk_item_subtotal', 'chk_menu_price',
        'chk_order_total', 'fk_oi_menu', 'fk_oi_order',
      ]);
      assert.match(schema, /CREATE TABLE users/);
      const [[statusColumn]] = await connection.execute(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hotels' AND COLUMN_NAME = 'status'`, [databaseName],
      );
      assert.equal(statusColumn.COLUMN_TYPE, "enum('active','suspended','pending','rejected')");
    });

    await t.test('migration preserves orders/items and links old ADMIN to hotel 1', async () => {
      await installOldSchema(connection);

      await connection.execute(
        `INSERT INTO menu_items (name, category, price) VALUES (?, ?, ?)`,
        ['Legacy Dosa', 'Breakfast', 80],
      );
      await assert.rejects(runMigration(connection), /Resolve duplicate menu rows/);
      const [notChanged] = await connection.execute(
        `SELECT COUNT(*) AS table_count FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hotels'`,
        [databaseName],
      );
      assert.equal(Number(notChanged[0].table_count), 0, 'duplicate preflight must stop before creating hotel data');
      await connection.execute(
        `DELETE FROM menu_items WHERE name = ? AND category = ? AND id <> ?`,
        ['Legacy Dosa', 'Breakfast', 11],
      );

      await runMigration(connection);

      const [defaultHotelRows] = await connection.execute('SELECT name, slug FROM hotels WHERE id = ?', [1]);
      assert.deepEqual(defaultHotelRows.map((row) => [row.name, row.slug]), [['Udupi Hotel', 'udupi-hotel']]);

      const [orders] = await connection.execute('SELECT id, hotel_id FROM orders WHERE id = ?', [13]);
      const [items] = await connection.execute('SELECT id, order_id, hotel_id FROM order_items WHERE id = ?', [17]);
      assert.deepEqual(orders.map((row) => [Number(row.id), Number(row.hotel_id)]), [[13, 1]]);
      assert.deepEqual(items.map((row) => [Number(row.id), Number(row.order_id), Number(row.hotel_id)]), [[17, 13, 1]]);

      const [adminRows] = await connection.execute(
        `SELECT u.role, hm.hotel_id
         FROM users u JOIN hotel_members hm ON hm.user_id = u.id
         WHERE u.id = ?`,
        [7],
      );
      assert.deepEqual(adminRows.map((row) => [row.role, Number(row.hotel_id)]), [['CUSTOMER', 1]]);
      const [platformAdmins] = await connection.execute("SELECT id FROM users WHERE role = 'PLATFORM_ADMIN'");
      assert.equal(platformAdmins.length, 0);

      await runMigration(connection);
      const [repeatCounts] = await connection.execute(
        `SELECT (SELECT COUNT(*) FROM orders) AS order_count,
                (SELECT COUNT(*) FROM order_items) AS item_count`,
      );
      assert.equal(Number(repeatCounts[0].order_count), 1);
      assert.equal(Number(repeatCounts[0].item_count), 1);

      await connection.execute("UPDATE hotels SET status = 'suspended' WHERE id = 1");
      const [activeHotel] = await connection.execute(
        `INSERT INTO hotels (name, slug, status) VALUES ('Migration Active', 'migration-active', 'active')`,
      );
      await runOnboardingMigration(connection);
      const [hotelStatuses] = await connection.execute(
        'SELECT id, status FROM hotels WHERE id IN (?, ?) ORDER BY id', [1, activeHotel.insertId],
      );
      assert.deepEqual(hotelStatuses.map((row) => row.status), ['suspended', 'active']);
      await runOnboardingMigration(connection);
      const [repeatStatuses] = await connection.execute(
        'SELECT id, status FROM hotels WHERE id IN (?, ?) ORDER BY id', [1, activeHotel.insertId],
      );
      assert.deepEqual(repeatStatuses.map((row) => row.status), ['suspended', 'active']);
      await connection.execute('DELETE FROM hotels WHERE id = ?', [activeHotel.insertId]);
    });

    await t.test('composite foreign keys reject mismatched order and menu tenants', async () => {
      await connection.execute(
        `INSERT INTO hotels (id, name, slug) VALUES (?, ?, ?)`,
        [2, 'Second Test Hotel', 'second-test-hotel'],
      );
      const [otherMenu] = await connection.execute(
        `INSERT INTO menu_items (hotel_id, name, category, price)
         VALUES (?, ?, ?, ?)`,
        [2, 'Other Tenant Dish', 'Lunch', 50],
      );
      const mismatch = (orderId, hotelId, menuItemId) => connection.execute(
        `INSERT INTO order_items
          (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, hotelId, menuItemId, 'Invalid Cross Tenant Item', 50, 1, 50],
      );
      const [legacyMenu] = await connection.execute('SELECT id FROM menu_items WHERE id = ?', [11]);
      assert.ok(legacyMenu.length);
      await assert.rejects(mismatch(13, 2, Number(otherMenu.insertId)), (error) =>
        ['ER_NO_REFERENCED_ROW_2', 'ER_NO_REFERENCED_ROW'].includes(error.code));
      await assert.rejects(mismatch(13, 1, Number(otherMenu.insertId)), (error) =>
        ['ER_NO_REFERENCED_ROW_2', 'ER_NO_REFERENCED_ROW'].includes(error.code));
    });

    await t.test('valid order items and same names across different categories or hotels remain allowed', async () => {
      const [validItem] = await connection.execute(
        `INSERT INTO order_items
          (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [13, 1, 11, 'Legacy Dosa', 75.5, 1, 75.5],
      );
      assert.ok(validItem.insertId > 0);
      await connection.execute('DELETE FROM order_items WHERE id = ?', [validItem.insertId]);

      const [differentCategory] = await connection.execute(
        `INSERT INTO menu_items (hotel_id, name, category, price) VALUES (?, ?, ?, ?)`,
        [1, 'Legacy Dosa', 'Evening Snacks', 80],
      );
      const [differentHotel] = await connection.execute(
        `INSERT INTO menu_items (hotel_id, name, category, price) VALUES (?, ?, ?, ?)`,
        [2, 'Legacy Dosa', 'Breakfast', 80],
      );
      assert.ok(differentCategory.insertId > 0);
      assert.ok(differentHotel.insertId > 0);
      await connection.execute('DELETE FROM menu_items WHERE id IN (?, ?)', [differentCategory.insertId, differentHotel.insertId]);
    });

    await t.test('price, quantity, subtotal, and order total checks reject invalid values', async () => {
      const checkViolation = (error) => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED';
      await assert.rejects(
        connection.execute(
          `INSERT INTO menu_items (hotel_id, name, category, price) VALUES (?, ?, ?, ?)`,
          [1, 'Invalid Price Item', 'Test', 0],
        ),
        checkViolation,
      );
      await assert.rejects(
        connection.execute(
          `INSERT INTO orders (hotel_id, user_id, customer_name, phone, payment_method, total_amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [1, 7, 'Test Customer', '+910000000007', 'cash', -1],
        ),
        checkViolation,
      );
      for (const [unitPrice, quantity, subtotal] of [[0, 1, 1], [1, 0, 1], [1, 1, 0]]) {
        await assert.rejects(
          connection.execute(
            `INSERT INTO order_items
              (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [13, 1, 11, 'Invalid Snapshot', unitPrice, quantity, subtotal],
          ),
          checkViolation,
        );
      }
    });

    await t.test('duplicate hotel/category/name menu item is rejected', async () => {
      await assert.rejects(
        connection.execute(
          `INSERT INTO menu_items (hotel_id, name, category, price)
           VALUES (?, ?, ?, ?)`,
          [1, 'Legacy Dosa', 'Breakfast', 80],
        ),
        (error) => error.code === 'ER_DUP_ENTRY',
      );
    });
  } finally {
    await connection.end();
  }
});
