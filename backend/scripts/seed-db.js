'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { assertDemoDatabase, connectionOptions, selectedDatabase, validateDatabaseIdentifier } = require('./db-config');

const SEED_PATH = path.resolve(__dirname, '..', 'database', 'seed.sql');

async function applySeed(connection, database, seedPath = SEED_PATH) {
  const target = assertDemoDatabase(validateDatabaseIdentifier(database));
  const [[selected]] = await connection.query('SELECT DATABASE() AS database_name');
  if (selected?.database_name !== target) {
    throw new Error(`Seed target mismatch: connection is not using selected database "${target}".`);
  }
  const seed = await fs.readFile(seedPath, 'utf8');
  if (/^\s*(?:CREATE\s+DATABASE|USE\s+|TRUNCATE\s+|DROP\s+)/im.test(seed)) {
    throw new Error('Demo seed must not create, switch, drop, or truncate databases or tables.');
  }
  await connection.query(seed);
}

async function seedDatabase({ database, mysqlClient = mysql, logger = console } = {}) {
  const target = assertDemoDatabase(database || selectedDatabase());
  const connection = await mysqlClient.createConnection(connectionOptions({ database: target, multipleStatements: true }));
  try {
    await applySeed(connection, target);
    const [[{ hotelCount }]] = await connection.query('SELECT COUNT(*) AS hotelCount FROM hotels');
    const [[{ menuItemCount }]] = await connection.query('SELECT COUNT(*) AS menuItemCount FROM menu_items');
    const [[{ platformAdminCount }]] = await connection.query("SELECT COUNT(*) AS platformAdminCount FROM users WHERE role = 'PLATFORM_ADMIN'");
    logger.log(`[db:seed] Idempotent demo seed applied to selected database "${target}".`);
    logger.log(`[db:seed] Hotels: ${hotelCount}; menu items: ${menuItemCount}; platform admins unchanged: ${platformAdminCount}.`);
    return { database: target, hotelCount, menuItemCount, platformAdminCount };
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  seedDatabase().catch((error) => {
    console.error(`[db:seed] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { SEED_PATH, applySeed, seedDatabase };
