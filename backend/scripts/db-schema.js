'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { selectedDatabase, validateDatabaseIdentifier } = require('./db-config');

const SCHEMA_PATH = path.resolve(__dirname, '..', 'database', 'schema.sql');

async function applySchema(connection, database) {
  const target = validateDatabaseIdentifier(database);
  const [[selected]] = await connection.query('SELECT DATABASE() AS database_name');
  if (selected?.database_name !== target) {
    throw new Error(`Schema target mismatch: connection is not using selected database "${target}".`);
  }

  const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
  if (/^\s*(?:CREATE\s+DATABASE|USE\s+)/im.test(schema)) {
    throw new Error('Authoritative schema must not create or switch databases.');
  }
  await connection.query(schema);
}

async function main() {
  const { initDatabase } = require('./init-db');
  return initDatabase({ database: selectedDatabase() });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:schema] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { SCHEMA_PATH, applySchema };
