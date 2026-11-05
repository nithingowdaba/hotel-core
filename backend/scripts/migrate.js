'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { connectionOptions, databaseFromArgs } = require('./db-config');

const TABLES = ['users', 'hotels', 'hotel_members', 'menu_items', 'orders', 'order_items'];
const MIGRATION_PROCEDURE = 'migrate_001_multi_tenancy';

async function tableExists(connection, table) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function readRowCounts(connection) {
  const counts = {};
  for (const table of TABLES) {
    if (!(await tableExists(connection, table))) {
      counts[table] = null;
      continue;
    }
    const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${table}\``);
    counts[table] = Number(rows[0].row_count);
  }
  return counts;
}

async function expectedRowCounts(connection, before) {
  const expected = Object.fromEntries(TABLES.map((table) => [table, before[table] || 0]));
  let hasDefaultHotel = false;
  if (await tableExists(connection, 'hotels')) {
    const [rows] = await connection.execute('SELECT id FROM hotels WHERE id = ?', [1]);
    hasDefaultHotel = rows.length > 0;
  }
  if (!hasDefaultHotel) expected.hotels += 1;

  const hasMembers = await tableExists(connection, 'hotel_members');
  const membershipQuery = hasMembers
    ? `SELECT COUNT(*) AS row_count
       FROM users u
       WHERE u.role = 'ADMIN'
         AND NOT EXISTS (
           SELECT 1 FROM hotel_members hm WHERE hm.user_id = u.id AND hm.hotel_id = 1
         )`
    : "SELECT COUNT(*) AS row_count FROM users WHERE role = 'ADMIN'";
  const [membershipRows] = await connection.query(membershipQuery);
  expected.hotel_members += Number(membershipRows[0].row_count);
  return expected;
}

function printCounts(label, counts) {
  console.log(`${label} row counts:`);
  for (const table of TABLES) {
    const count = counts[table];
    console.log(`  ${table}: ${count === null ? 'not present' : count}`);
  }
}

async function preflight(connection) {
  for (const table of ['users', 'menu_items', 'orders', 'order_items']) {
    if (!(await tableExists(connection, table))) {
      throw new Error(`Cannot migrate: required legacy table "${table}" is missing.`);
    }
  }

  if (await tableExists(connection, 'hotels')) {
    const [hotelOne] = await connection.execute('SELECT id, slug FROM hotels WHERE id = ?', [1]);
    if (hotelOne.length && hotelOne[0].slug !== 'udupi-hotel') {
      throw new Error('Cannot migrate: hotel id 1 is already assigned to another hotel.');
    }
    const [slugRows] = await connection.execute('SELECT id FROM hotels WHERE slug = ?', ['udupi-hotel']);
    if (slugRows.length && Number(slugRows[0].id) !== 1) {
      throw new Error('Cannot migrate: slug "udupi-hotel" is already assigned to an id other than 1.');
    }
  }

  const hasHotelId = await columnExists(connection, 'menu_items', 'hotel_id');
  const duplicateGrouping = hasHotelId
    ? 'COALESCE(hotel_id, 1), category, name'
    : 'category, name';
  const hotelColumn = hasHotelId ? 'COALESCE(hotel_id, 1) AS hotel_id, ' : '1 AS hotel_id, ';
  const [duplicates] = await connection.query(
    `SELECT ${hotelColumn}category, name, COUNT(*) AS duplicate_count
     FROM menu_items
     GROUP BY ${duplicateGrouping}
     HAVING COUNT(*) > 1
     ORDER BY hotel_id, category, name`,
  );
  if (duplicates.length) {
    console.error('Duplicate (hotel_id, category, name) menu rows found; migration stopped before changes:');
    for (const row of duplicates) {
      console.error(`  hotel_id=${row.hotel_id}, category=${row.category}, name=${row.name}, rows=${row.duplicate_count}`);
    }
    throw new Error('Resolve duplicate menu rows and run the migration again.');
  }
}

async function dropLegacyOrderItemForeignKeys(connection) {
  const [rows] = await connection.execute(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'order_items'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       AND CONSTRAINT_NAME LIKE 'fk_order_items_%'`,
  );
  for (const { CONSTRAINT_NAME: name } of rows) {
    const quotedName = `\`${String(name).replaceAll('`', '``')}\``;
    await connection.query(`ALTER TABLE order_items DROP FOREIGN KEY ${quotedName}`);
  }
}

async function runMigration(connection) {
  await preflight(connection);
  const before = await readRowCounts(connection);
  const expected = await expectedRowCounts(connection, before);
  printCounts('Before', before);

  await dropLegacyOrderItemForeignKeys(connection);
  const migrationPath = path.resolve(__dirname, '..', 'database', 'migrations', '001-multi-tenancy.sql');
  const migrationSql = await fs.readFile(migrationPath, 'utf8');

  try {
    await connection.query(migrationSql);
    await connection.query(`CALL ${MIGRATION_PROCEDURE}()`);
  } finally {
    await connection.query(`DROP PROCEDURE IF EXISTS ${MIGRATION_PROCEDURE}`);
  }

  const after = await readRowCounts(connection);
  printCounts('After', after);

  const changedTables = TABLES.filter((table) => expected[table] !== after[table]);
  if (changedTables.length) {
    throw new Error(`Unexpected row count changes: ${changedTables.map((table) => `${table} expected ${expected[table]}, got ${after[table]}`).join('; ')}.`);
  }

  const [defaultHotel] = await connection.execute('SELECT id, slug FROM hotels WHERE id = ?', [1]);
  if (!defaultHotel.length || defaultHotel[0].slug !== 'udupi-hotel') {
    throw new Error('Migration did not establish Udupi Hotel as hotel id 1.');
  }

  console.log('Legacy user, menu, order, and order-item row counts are preserved.');
  return { before, after };
}

async function multiTenantSchemaExists(connection) {
  const requiredColumns = [
    ['hotels', 'slug'], ['hotel_members', 'user_id'], ['menu_items', 'hotel_id'],
    ['orders', 'hotel_id'], ['order_items', 'hotel_id'],
  ];
  for (const [table, column] of requiredColumns) {
    if (!(await columnExists(connection, table, column))) return false;
  }
  const [roleRows] = await connection.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1`,
  );
  if (roleRows[0]?.COLUMN_TYPE !== "enum('CUSTOMER','PLATFORM_ADMIN')") return false;
  const [foreignKeys] = await connection.execute(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
       AND CONSTRAINT_NAME IN ('fk_oi_order', 'fk_oi_menu')`,
  );
  return foreignKeys.length === 2;
}

async function runOnboardingMigration(connection) {
  const migrationPath = path.resolve(__dirname, '..', 'database', 'migrations', '002-hotel-onboarding.sql');
  const migrationSql = await fs.readFile(migrationPath, 'utf8');
  const procedure = 'migrate_002_hotel_onboarding';
  try {
    await connection.query(migrationSql);
    await connection.query(`CALL ${procedure}()`);
  } finally {
    await connection.query(`DROP PROCEDURE IF EXISTS ${procedure}`);
  }
}

async function main() {
  const database = databaseFromArgs();
  const connection = await mysql.createConnection(connectionOptions({ database, multipleStatements: true }));
  try {
    console.log(`Running manual multi-tenancy migration on database "${database}".`);
    if (await multiTenantSchemaExists(connection)) {
      console.log('Multi-tenancy migration 001 is already applied; preserving existing hotel statuses.');
    } else {
      await runMigration(connection);
    }
    await runOnboardingMigration(connection);
    console.log('Migration complete.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[migrate] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runMigration, runOnboardingMigration, multiTenantSchemaExists };
