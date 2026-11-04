'use strict';

const { sendError } = require('../utils/response');
const env = require('../config/env');

/**
 * Centralized Express error handling middleware.
 * Must be registered last with four parameters.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Operational errors: expected, user-facing
  if (err.isOperational) {
    return sendError(res, err.statusCode, err.code, err.message, err.details || []);
  }

  // Validation errors from express-validator (handled by validate middleware)
  if (err.type === 'validation') {
    return sendError(res, 400, 'VALIDATION_ERROR', err.message, err.details || []);
  }

  // MySQL errors
  if (err.code === 'ER_DUP_ENTRY') {
    return sendError(res, 409, 'DUPLICATE_ENTRY', 'A record with that value already exists.');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 401, 'INVALID_TOKEN', 'Invalid authentication token.');
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 401, 'TOKEN_EXPIRED', 'Authentication token has expired.');
  }

  // Unknown/programming errors — do not leak details in production
  console.error('[errorHandler] Unhandled error:', err);

  const message =
    env.nodeEnv === 'development' ? err.message : 'An unexpected error occurred.';

  return sendError(res, 500, 'INTERNAL_ERROR', message);
}

module.exports = errorHandler;
