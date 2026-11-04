'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

function buildAuthToken(user) {
  return jwt.sign({}, env.jwt.secret, {
    subject: String(user.id),
    issuer: env.jwt.issuer,
    expiresIn: env.jwt.expiresIn,
  });
}

module.exports = { buildAuthToken };
