'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { connectionOptions, databaseFromArgs } = require('./db-config');

async function applySchema(connection, database) {
  const schemaPath = path.resolve(__dirname, '..', 'database', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  const selectedSchema = schema.replace(/`hotel_core`/g, `\`${database}\``);
  await connection.query(selectedSchema);
}

async function main() {
  const database = databaseFromArgs();
  const connection = await mysql.createConnection(connectionOptions({ multipleStatements: true }));
  try {
    await applySchema(connection, database);
    console.log(`Fresh schema applied to database "${database}".`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db:schema] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { applySchema };
