'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function databaseFromArgs(args = process.argv.slice(2)) {
  let database = process.env.DB_NAME || 'hotel_core';

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--database') {
      database = args[index + 1];
      index += 1;
    } else if (args[index].startsWith('--database=')) {
      database = args[index].slice('--database='.length);
    }
  }

  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('Database name must contain only letters, digits, or underscores.');
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
  if (database) options.database = database;
  if (process.env.DB_SOCKET_PATH) {
    delete options.host;
    delete options.port;
    options.socketPath = process.env.DB_SOCKET_PATH;
  }
  return options;
}

module.exports = { connectionOptions, databaseFromArgs };
