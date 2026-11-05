'use strict';

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const env = require('../config/env');
const { asyncHandler, httpError } = require('../utils/http');

const authenticate = asyncHandler(async (req, res, next) => {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');

  let payload;
  try {
    payload = jwt.verify(match[1], env.jwt.secret, { issuer: env.jwt.issuer });
  } catch {
    throw httpError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token.');
  }
  if (!payload.sub || !/^\d+$/.test(String(payload.sub))) {
    throw httpError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token.');
  }

  const [rows] = await query(
    `SELECT id, full_name, email, phone, role, is_active
     FROM users WHERE id = ? LIMIT 1`,
    [payload.sub],
  );
  if (!rows.length || !rows[0].is_active) {
    throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
  req.user = rows[0];
  next();
});

function optionalAuthenticate(req, res, next) {
  if (!req.get('authorization')) return next();
  return authenticate(req, res, next);
}

module.exports = { authenticate, optionalAuthenticate };
