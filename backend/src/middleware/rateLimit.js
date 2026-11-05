'use strict';

const rateLimit = require('express-rate-limit');
const { sendError } = require('../../utils/response');

function limiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      sendError(res, 429, 'RATE_LIMITED', message, []);
    },
  });
}

const apiLimiter = limiter(60 * 1000, 300, 'Too many requests. Please try again later.');
const authLimiter = limiter(15 * 60 * 1000, 10, 'Too many authentication attempts. Please try again later.');
const hotelRegistrationLimiter = limiter(60 * 60 * 1000, 5, 'Too many hotel registration attempts. Please try again later.');

module.exports = { apiLimiter, authLimiter, hotelRegistrationLimiter };
