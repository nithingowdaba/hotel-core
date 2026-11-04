'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const { query: dbQuery } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { resolveHotel, requireHotelAdmin } = require('../middleware/tenant');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const {
  positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody,
  httpsUrlRule, booleanRule, priceRule, priceAsDecimal, validate,
  normalizeMenuItem,
} = require('./routeUtils');

const router = Router();
const fields = 'id, name, description, category, price, is_veg, image_url, is_available';
const nameRule = (field) => body(field).trim().isString().isLength({ min: 1, max: 120 });
const categoryRule = (field) => body(field).trim().isString().isLength({ min: 1, max: 80 });
const textRule = (field) => body(field).optional({ nullable: true }).isString();
function requirePublicActiveHotel(req, res, next) {
  if (req.hotel.status !== 'active') {
    return next(httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.'));
  }
  return next();
}

/** @openapi
 * /api/hotels/{hotelId}/menu-items:
 *   get:
 *     tags: [Menu]
 *     summary: List a hotel's menu items
 *     security: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: available
 *         schema: { type: boolean }
 *       - in: query
 *         name: veg
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated menu items }
 *       404: { description: Hotel not found }
 */
router.get('/:hotelId/menu-items', [
  positiveId('hotelId'),
  rejectUnknownQuery(['search', 'category', 'available', 'veg', 'page', 'limit']),
  query('search').optional().isString().isLength({ max: 120 }),
  query('category').optional().isString().isLength({ max: 80 }),
  query('available').optional().isIn(['true', 'false']),
  query('veg').optional().isIn(['true', 'false']),
  ...paginationRules(), validate, resolveHotel, requirePublicActiveHotel,
], asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = req.query.search ? `%${req.query.search}%` : null;
  const category = req.query.category || null;
  const available = req.query.available === undefined ? null : req.query.available === 'true';
  const veg = req.query.veg === undefined ? null : req.query.veg === 'true';
  const values = [req.hotel.id, search, search, search, category, category, available, available, veg, veg];
  const where = `hotel_id = ?
    AND (? IS NULL OR name LIKE ? OR description LIKE ?)
    AND (? IS NULL OR category = ?)
    AND (? IS NULL OR is_available = ?)
    AND (? IS NULL OR is_veg = ?)`;
  const [countRows] = await dbQuery(`SELECT COUNT(*) AS total FROM menu_items WHERE ${where}`, values);
  const [rows] = await dbQuery(
    `SELECT ${fields} FROM menu_items WHERE ${where} ORDER BY category, name LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const total = Number(countRows[0].total);
  collection(res, rows.map(normalizeMenuItem), { page, limit, total, totalPages: Math.ceil(total / limit) });
}));

/** @openapi
 * /api/hotels/{hotelId}/menu-items/{id}:
 *   get:
 *     tags: [Menu]
 *     summary: Get a menu item from the specified hotel
 *     security: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Menu item }
 *       404: { description: Hotel or menu item not found }
 */
router.get('/:hotelId/menu-items/:id', [
  positiveId('hotelId'), positiveId('id'), rejectUnknownQuery([]), validate, resolveHotel, requirePublicActiveHotel,
], asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT ${fields} FROM menu_items WHERE id = ? AND hotel_id = ? LIMIT 1`,
    [req.params.id, req.hotel.id],
  );
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found.');
  single(res, normalizeMenuItem(rows[0]));
}));

/** @openapi
 * /api/hotels/{hotelId}/menu-items:
 *   post:
 *     tags: [Menu]
 *     summary: Create a menu item
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, price]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, nullable: true }
 *               category: { type: string, minLength: 1, maxLength: 80 }
 *               price: { oneOf: [{ type: string }, { type: number }], exclusiveMinimum: 0 }
 *               is_veg: { type: boolean, default: true }
 *               image_url: { type: string, format: uri, nullable: true, maxLength: 500 }
 *               is_available: { type: boolean, default: true }
 *     responses:
 *       201: { description: Menu item created }
 *       400: { description: Invalid menu item }
 *       403: { description: Hotel admin access required or hotel suspended }
 *       409: { description: Duplicate item in this category }
 */
router.post('/:hotelId/menu-items', [
  authenticate, positiveId('hotelId'),
  rejectUnknownQuery([]),
  rejectUnknownBody(['name', 'description', 'category', 'price', 'is_veg', 'image_url', 'is_available']),
  nameRule('name'), textRule('description'), categoryRule('category'), priceRule(),
  booleanRule('is_veg'), httpsUrlRule('image_url'), booleanRule('is_available'),
  validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const {
    name, description = null, category, price,
    is_veg: isVeg = true, image_url: imageUrl = null, is_available: isAvailable = true,
  } = req.body;
  try {
    const [result] = await dbQuery(
      `INSERT INTO menu_items (hotel_id, name, description, category, price, is_veg, image_url, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.hotel.id, name, description, category, priceAsDecimal(price), isVeg, imageUrl, isAvailable],
    );
    const [rows] = await dbQuery(`SELECT ${fields} FROM menu_items WHERE id = ? AND hotel_id = ?`, [result.insertId, req.hotel.id]);
    return single(res, normalizeMenuItem(rows[0]), 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'MENU_ITEM_EXISTS', 'An item with this name already exists in the category.');
    throw err;
  }
}));

const patchFields = ['name', 'description', 'category', 'price', 'is_veg', 'image_url', 'is_available'];
const patchValidators = [
  nameRule('name').optional(), textRule('description'), categoryRule('category').optional(),
  priceRule(true), booleanRule('is_veg'), httpsUrlRule('image_url'), booleanRule('is_available'),
];

/** @openapi
 * /api/hotels/{hotelId}/menu-items/{id}:
 *   patch:
 *     tags: [Menu]
 *     summary: Update a menu item
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, minProperties: 1 }
 *     responses:
 *       200: { description: Updated menu item }
 *       400: { description: Invalid update }
 *       403: { description: Hotel admin access required }
 *       404: { description: Menu item not found }
 *       409: { description: Duplicate item in this category }
 */
router.patch('/:hotelId/menu-items/:id', [
  authenticate, positiveId('hotelId'), positiveId('id'),
  rejectUnknownQuery([]),
  rejectUnknownBody(patchFields, { requireAtLeastOne: true }), ...patchValidators,
  validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const keys = patchFields.filter((field) => Object.hasOwn(req.body, field));
  const values = keys.map((field) => field === 'price' ? priceAsDecimal(req.body[field]) : req.body[field]);
  try {
    await dbQuery(
      `UPDATE menu_items SET ${keys.map((field) => `\`${field}\` = ?`).join(', ')}
       WHERE id = ? AND hotel_id = ?`, [...values, req.params.id, req.hotel.id],
    );
    const [rows] = await dbQuery(
      `SELECT ${fields} FROM menu_items WHERE id = ? AND hotel_id = ?`, [req.params.id, req.hotel.id],
    );
    if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found.');
    return single(res, normalizeMenuItem(rows[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'MENU_ITEM_EXISTS', 'An item with this name already exists in the category.');
    throw err;
  }
}));

/** @openapi
 * /api/hotels/{hotelId}/menu-items/{id}/availability:
 *   patch:
 *     tags: [Menu]
 *     summary: Set menu item availability
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_available]
 *             properties:
 *               is_available: { type: boolean }
 *     responses:
 *       200: { description: Availability updated }
 *       403: { description: Hotel admin access required }
 *       404: { description: Menu item not found }
 */
router.patch('/:hotelId/menu-items/:id/availability', [
  authenticate, positiveId('hotelId'), positiveId('id'),
  rejectUnknownQuery([]),
  rejectUnknownBody(['is_available']), body('is_available').exists().bail().custom((value) => typeof value === 'boolean'),
  validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  await dbQuery(
    'UPDATE menu_items SET is_available = ? WHERE id = ? AND hotel_id = ?',
    [req.body.is_available, req.params.id, req.hotel.id],
  );
  const [rows] = await dbQuery(`SELECT ${fields} FROM menu_items WHERE id = ? AND hotel_id = ?`, [req.params.id, req.hotel.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found.');
  single(res, normalizeMenuItem(rows[0]));
}));

module.exports = router;
