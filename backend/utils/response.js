'use strict';

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({ success: true, data });
}

/**
 * Send a paginated successful response.
 * @param {import('express').Response} res
 * @param {Array} data
 * @param {{ total: number, page: number, limit: number }} meta
 */
function sendPaginated(res, data, meta) {
  const totalPages = Math.ceil(meta.total / meta.limit);
  res.status(200).json({
    success: true,
    data,
    meta: {
      total: meta.total,
      page: meta.page,
      limit: meta.limit,
      totalPages,
    },
  });
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} code
 * @param {string} message
 * @param {Array} [details=[]]
 */
function sendError(res, statusCode, code, message, details = []) {
  res.status(statusCode).json({
    success: false,
    error: { code, message, details },
  });
}

module.exports = { sendSuccess, sendPaginated, sendError };
