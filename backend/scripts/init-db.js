'use strict';

const mysql = require('mysql2/promise');
const { connectionOptions, quoteDatabaseIdentifier, selectedDatabase } = require('./db-config');
const { applySchema } = require('./db-schema');

const TABLES = ['users', 'hotels', 'hotel_members', 'menu_items', 'orders', 'order_items'];

async function initDatabase({ database, mysqlClient = mysql, logger = console } = {}) {
  const target = database || selectedDatabase();
  const quotedTarget = quoteDatabaseIdentifier(target);
  const adminConnection = await mysqlClient.createConnection(connectionOptions({ multipleStatements: false }));
  try {
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS ${quotedTarget} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await adminConnection.end();
  }

  const connection = await mysqlClient.createConnection(connectionOptions({ database: target, multipleStatements: true }));
  try {
    await applySchema(connection, target);
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    );
    const actual = tables.map((table) => table.TABLE_NAME || table.table_name);
    const missing = TABLES.filter((table) => !actual.includes(table));
    if (missing.length) throw new Error(`Schema initialization did not create required tables: ${missing.join(', ')}.`);
    logger.log(`[db:init] Fresh schema applied to selected database "${target}".`);
    logger.log(`[db:init] Tables present: ${actual.join(', ')}`);
    return { database: target, tables: actual };
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  initDatabase().catch((error) => {
    console.error(`[db:init] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { initDatabase };
