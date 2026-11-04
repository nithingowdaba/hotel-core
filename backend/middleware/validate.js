'use strict';

const { validationResult } = require('express-validator');
const { sendError } = require('../utils/response');

/**
 * Runs after express-validator chains and returns 400 if any errors exist.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Request validation failed.',
      errors.array().map((e) => ({ field: e.path, message: e.msg })),
    );
  }
  next();
}

module.exports = validate;
