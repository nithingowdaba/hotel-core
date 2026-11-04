'use strict';

/**
 * Script for fresh database initialization.
 * Reads and applies database/schema.sql.
 *
 * Usage: npm run db:init  OR  node scripts/init-db.js
 */

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function initDatabase() {
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`[db:init] Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log(`[db:init] Connecting to MySQL at ${env.db.socketPath || `${env.db.host}:${env.db.port}`}…`);

  const connectionConfig = {
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  };

  if (env.db.socketPath) {
    connectionConfig.socketPath = env.db.socketPath;
  } else {
    connectionConfig.host = env.db.host;
    connectionConfig.port = env.db.port;
  }

  const connection = await mysql.createConnection(connectionConfig);

  try {
    console.log('[db:init] Executing schema.sql…');
    await connection.query(sql);

    const [tables] = await connection.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [env.db.name]
    );

    console.log(`[db:init] ✓ Database "${env.db.name}" initialized successfully.`);
    console.log(`[db:init] Tables created:`, tables.map((t) => t.TABLE_NAME || t.table_name).join(', '));
  } catch (err) {
    console.error('[db:init] Failed to initialize database:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

initDatabase();
