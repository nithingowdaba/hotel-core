'use strict';

const dotenv = require('dotenv');
dotenv.config();

const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => process.env[key] === undefined || process.env[key] === '');
if (missing.length) {
  throw new Error(`[env] Missing required environment variable(s): ${missing.join(', ')}`);
}

const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret.length < 32) {
  throw new Error('[env] JWT_SECRET must be at least 32 characters long.');
}

function positiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`[env] ${name} must be a positive integer.`);
  }
  return parsed;
}

const dbPort = positiveInteger('DB_PORT', process.env.DB_PORT);
const dbPoolSize = positiveInteger('DB_POOL_SIZE', process.env.DB_POOL_SIZE || '10');
const port = positiveInteger('PORT', process.env.PORT || '4000');
const autoApproveHotels = process.env.AUTO_APPROVE_HOTELS || 'false';
if (!['true', 'false'].includes(autoApproveHotels)) {
  throw new Error('[env] AUTO_APPROVE_HOTELS must be true or false.');
}

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port,
  corsOrigin: process.env.CORS_ORIGIN || '',
  autoApproveHotels: autoApproveHotels === 'true',
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: dbPort,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    poolSize: dbPoolSize,
    connectionLimit: dbPoolSize,
    socketPath: process.env.DB_SOCKET_PATH || undefined,
  }),
  jwt: Object.freeze({ secret: jwtSecret, issuer: 'hotel-core', expiresIn: '1h' }),
});
