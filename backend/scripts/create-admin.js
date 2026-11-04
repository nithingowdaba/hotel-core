'use strict';

/**
 * CLI script to create a PLATFORM_ADMIN user.
 * Usage: node scripts/create-admin.js <email> <password> <name>
 *
 * This is the ONLY way to create a platform admin.
 * Platform admins cannot be created through the API.
 */

require('../config/env');
const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

async function main() {
  const args = process.argv.slice(2);

  let email = args[0];
  let password = args[1];
  let name = args[2];

  if (!email || !password || !name) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    if (!email) email = await ask('Email: ');
    if (!password) password = await ask('Password (min 8 chars): ');
    if (!name) name = await ask('Full name: ');

    rl.close();
  }

  email = email.trim().toLowerCase();
  name = name.trim();

  if (!email || !password || !name) {
    console.error('Error: email, password, and name are required.');
    process.exit(1);
  }

  if (password.length < 8 || password.length > 72) {
    console.error('Error: Password must be between 8 and 72 characters.');
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('Error: Invalid email format.');
    process.exit(1);
  }

  console.log(`Creating PLATFORM_ADMIN: ${email} …`);

  const hash = await bcrypt.hash(password, 12);

  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    console.error(`Error: A user with email ${email} already exists.`);
    process.exit(1);
  }

  await query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES (?, ?, ?, 'PLATFORM_ADMIN')`,
    [name, email, hash],
  );

  console.log(`✓ PLATFORM_ADMIN created: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
