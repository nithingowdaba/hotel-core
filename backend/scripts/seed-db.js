'use strict';

/**
 * Script for safe development database seeding.
 * Reads and applies database/seed.sql.
 *
 * Usage: npm run db:seed  OR  node scripts/seed-db.js
 */

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function seedDatabase() {
  const seedPath = path.resolve(__dirname, '../../database/seed.sql');
  if (!fs.existsSync(seedPath)) {
    console.error(`[db:seed] Seed file not found: ${seedPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(seedPath, 'utf8');

  console.log(`[db:seed] Connecting to database "${env.db.name}"…`);

  const connectionConfig = {
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
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
    console.log('[db:seed] Applying seed data…');
    await connection.query(sql);

    const [[{ hotelCount }]] = await connection.query('SELECT COUNT(*) AS hotelCount FROM hotels');
    const [[{ menuItemCount }]] = await connection.query('SELECT COUNT(*) AS menuItemCount FROM menu_items');
    const [[{ userCount }]] = await connection.query('SELECT COUNT(*) AS userCount FROM users');
    const [[{ adminCheck }]] = await connection.query("SELECT COUNT(*) AS adminCheck FROM users WHERE role = 'PLATFORM_ADMIN'");

    console.log(`[db:seed] ✓ Seeding complete.`);
    console.log(`[db:seed] Hotels seeded: ${hotelCount}`);
    console.log(`[db:seed] Menu items seeded: ${menuItemCount}`);
    console.log(`[db:seed] Users seeded: ${userCount}`);
    console.log(`[db:seed] Platform admins (must be 0): ${adminCheck}`);

    if (adminCheck > 0) {
      throw new Error('SECURITY VIOLATION: Platform admin found in seed data!');
    }
  } catch (err) {
    console.error('[db:seed] Failed to seed database:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seedDatabase();
