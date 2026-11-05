'use strict';

const { body, query, param } = require('express-validator');
const validate = require('../../middleware/validate');
const { httpError } = require('../utils/http');
const { rupeesToPaise, paiseToRupees } = require('../../utils/money');

const positiveId = (name) => param(name)
  .matches(/^[1-9]\d*$/).withMessage(`${name} must be a positive integer.`)
  .bail().custom((value) => Number.isSafeInteger(Number(value)))
  .withMessage(`${name} must be a positive integer.`);

function paginationRules() {
  return [
    query('page').optional().matches(/^[1-9]\d*$/).withMessage('page must be a positive integer.')
      .bail().custom((value) => Number.isSafeInteger(Number(value) * 100)),
    query('limit').optional().matches(/^[1-9]\d*$/).withMessage('limit must be a positive integer.')
      .bail().custom((value) => Number(value) <= 100),
  ];
}

function pagination(req) {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  return { page, limit, offset: (page - 1) * limit };
}

function rejectUnknownQuery(allowed) {
  return query().custom((value, { req }) => {
    const unknown = Object.keys(req.query).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`Unknown query parameter: ${unknown[0]}`);
    return true;
  });
}

function rejectUnknownBody(allowed, { requireAtLeastOne = false } = {}) {
  return body().custom((value, { req }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Body must be a JSON object.');
    const keys = Object.keys(value);
    const unknown = keys.find((key) => !allowed.includes(key));
    if (unknown) throw new Error(`Unknown body field: ${unknown}`);
    if (requireAtLeastOne && keys.length === 0) throw new Error('At least one field is required.');
    return true;
  });
}

function httpsUrlRule(field, optional = true) {
  const rule = body(field);
  if (optional) rule.optional({ nullable: true });
  return rule.isString().isLength({ max: 500 }).bail()
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage(`${field} must be an https URL of at most 500 characters.`);
}

function booleanRule(field, optional = true) {
  const rule = body(field);
  if (optional) rule.optional();
  return rule.custom((value) => typeof value === 'boolean')
    .withMessage(`${field} must be a boolean.`);
}

function priceRule(optional = false) {
  const rule = body('price');
  if (optional) rule.optional();
  return rule.custom((value) => {
    if (!(typeof value === 'string' || typeof value === 'number')) return false;
    const source = String(value);
    if (!/^\d+(?:\.\d{1,2})?$/.test(source)) return false;
    try {
      const paise = rupeesToPaise(source);
      return paise > 0 && paise <= 9999999999;
    } catch { return false; }
  }).withMessage('price must be a positive amount with at most two decimal places.');
}

function priceAsDecimal(value) {
  return paiseToRupees(rupeesToPaise(String(value)));
}

function normalizeMenuItem(row) {
  return { ...row, is_veg: Boolean(row.is_veg), is_available: Boolean(row.is_available) };
}

function normalizeHotel(row) {
  return { ...row, accepting_orders: Boolean(row.accepting_orders) };
}

function escapeLike(value) {
  return value.replace(/[!%_\\]/g, (character) => `!${character}`);
}

function requirePlatformAdmin(req, res, next) {
  if (req.user?.role !== 'PLATFORM_ADMIN') {
    return next(httpError(403, 'FORBIDDEN', 'Platform administrator access is required.'));
  }
  return next();
}

module.exports = {
  positiveId,
  paginationRules,
  pagination,
  rejectUnknownQuery,
  rejectUnknownBody,
  httpsUrlRule,
  booleanRule,
  priceRule,
  priceAsDecimal,
  normalizeMenuItem,
  normalizeHotel,
  escapeLike,
  requirePlatformAdmin,
  validate,
};
