'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { connectionOptions, databaseFromArgs } = require('./db-config');

async function main() {
  const database = databaseFromArgs();
  const connection = await mysql.createConnection(connectionOptions({ multipleStatements: true }));
  try {
    const seedPath = path.resolve(__dirname, '..', 'database', 'seed.sql');
    const seed = await fs.readFile(seedPath, 'utf8');
    await connection.query(seed.replace(/`hotel_core`/g, `\`${database}\``));
    console.log(`Development seed applied to database "${database}".`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  });
}
