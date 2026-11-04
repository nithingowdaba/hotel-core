'use strict';

/**
 * Operational application error with HTTP status and error code.
 */
class AppError extends Error {
  /**
   * @param {string} message Human-readable message
   * @param {number} statusCode HTTP status code
   * @param {string} code Machine-readable error code (e.g. 'NOT_FOUND')
   * @param {Array} [details=[]] Validation details or additional context
   */
  constructor(message, statusCode, code, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
