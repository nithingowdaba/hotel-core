'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { sendSuccess, sendPaginated, sendError } = require('../../utils/response');

function httpError(statusCode, code, message, details = []) {
  return new AppError(message, statusCode, code, details);
}

function single(res, data, statusCode = 200) {
  return sendSuccess(res, data, statusCode);
}

function collection(res, data, meta) {
  return sendPaginated(res, data, meta);
}

module.exports = { asyncHandler, httpError, single, collection, sendError };
