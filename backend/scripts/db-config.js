'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function validateDatabaseIdentifier(database) {
  if (typeof database !== 'string' || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('Database name must contain only letters, digits, or underscores.');
  }
  return database;
}

function quoteDatabaseIdentifier(database) {
  return `\`${validateDatabaseIdentifier(database)}\``;
}

function parseDatabaseArgument(args, fallback) {
  let database = fallback;
  let supplied = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--database') {
      database = args[index + 1];
      index += 1;
      supplied = true;
    } else if (args[index].startsWith('--database=')) {
      database = args[index].slice('--database='.length);
      supplied = true;
    }
  }
  if (!supplied && !database) throw new Error('Select a database with DB_NAME or --database.');
  return validateDatabaseIdentifier(database);
}

function selectedDatabase(args = process.argv.slice(2), environment = process.env) {
  return parseDatabaseArgument(args, environment.DB_NAME);
}

function databaseFromArgs(args = process.argv.slice(2)) {
  return parseDatabaseArgument(args, process.env.DB_NAME || 'hotel_core');
}

function assertDemoDatabase(database) {
  validateDatabaseIdentifier(database);
  if (!/(?:_dev|_test)$/.test(database)) {
    throw new Error('Demo seeding is allowed only for databases ending in _dev or _test.');
  }
  return database;
}

function assertResetDatabase(database, confirmation) {
  validateDatabaseIdentifier(database);
  if (!/_test$/.test(database)) {
    throw new Error('Database reset is allowed only for a database ending in _test.');
  }
  if (confirmation !== database) {
    throw new Error(`Reset refused. Pass --confirm-reset=${database} to confirm the exact test database.`);
  }
  return database;
}

function connectionOptions({ database, multipleStatements = false } = {}) {
  for (const key of ['DB_HOST', 'DB_USER']) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
  if (process.env.DB_PASSWORD === undefined) {
    throw new Error('Missing required environment variable: DB_PASSWORD');
  }

  const options = {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    multipleStatements,
  };
  if (database) options.database = validateDatabaseIdentifier(database);
  if (process.env.DB_SOCKET_PATH) {
    delete options.host;
    delete options.port;
    options.socketPath = process.env.DB_SOCKET_PATH;
  }
  return options;
}

module.exports = {
  assertDemoDatabase,
  assertResetDatabase,
  connectionOptions,
  databaseFromArgs,
  quoteDatabaseIdentifier,
  selectedDatabase,
  validateDatabaseIdentifier,
};
