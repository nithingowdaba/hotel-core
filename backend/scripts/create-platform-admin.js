'use strict';

require('../config/env');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcryptjs');
const { getPool, query } = require('../config/db');

async function promptMissing(values) {
  const prompts = [
    ['email', 'Email: '],
    ['fullName', 'Full name: '],
    ['phone', 'Phone: '],
    ['password', 'Password (8–72 characters): '],
  ];
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    for (const [key, label] of prompts) {
      if (!values[key]) values[key] = await rl.question(label);
    }
  } finally {
    rl.close();
  }
  return values;
}

async function main() {
  const [emailArg, fullNameArg, phoneArg, passwordArg] = process.argv.slice(2);
  const values = await promptMissing({
    email: emailArg,
    fullName: fullNameArg,
    phone: phoneArg,
    password: passwordArg,
  });
  const email = values.email.trim().toLowerCase();
  const fullName = values.fullName.trim();
  const phone = values.phone.trim();
  const password = values.password;

  if (!email || !fullName || !phone || !password) {
    throw new Error('Email, full name, phone, and password are required.');
  }
  if (password.length < 8 || password.length > 72) {
    throw new Error('Password must be between 8 and 72 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email format.');
  if (fullName.length > 120 || phone.length > 20) throw new Error('Full name or phone exceeds the supported length.');

  const [existing] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw new Error('A user with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, 'PLATFORM_ADMIN')`,
    [fullName, email, phone, passwordHash],
  );
  console.log(`PLATFORM_ADMIN created for ${email}.`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Unable to create PLATFORM_ADMIN: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      try { await getPool().end(); } catch { /* no connection was opened */ }
    });
}

module.exports = { main };
