'use strict';

const mysql = require('mysql2/promise');
const {
  assertResetDatabase,
  connectionOptions,
  quoteDatabaseIdentifier,
  selectedDatabase,
} = require('./db-config');
const { initDatabase } = require('./init-db');
const { seedDatabase } = require('./seed-db');

function resetConfirmation(args = process.argv.slice(2)) {
  const value = args.find((arg) => arg.startsWith('--confirm-reset='));
  return value ? value.slice('--confirm-reset='.length) : undefined;
}

async function resetDatabase({ args = process.argv.slice(2), mysqlClient = mysql, logger = console } = {}) {
  const database = selectedDatabase(args);
  assertResetDatabase(database, resetConfirmation(args));
  const connection = await mysqlClient.createConnection(connectionOptions({ multipleStatements: false }));
  try {
    await connection.query(`DROP DATABASE IF EXISTS ${quoteDatabaseIdentifier(database)}`);
  } finally {
    await connection.end();
  }
  await initDatabase({ database, mysqlClient, logger });
  await seedDatabase({ database, mysqlClient, logger });
  return { database };
}

if (require.main === module) {
  resetDatabase().catch((error) => {
    console.error(`[db:reset] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { resetConfirmation, resetDatabase };
