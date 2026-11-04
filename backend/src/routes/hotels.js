'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const { query: dbQuery } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { resolveHotel, requireHotelAdmin } = require('../middleware/tenant');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const {
  positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody,
  httpsUrlRule, booleanRule, normalizeHotel, normalizeMenuItem, validate,
} = require('./routeUtils');

const router = Router();
const hotelFields = `id, name, slug, description, cuisines, address, phone, logo_url,
  cover_url, accepting_orders, status`;
const menuFields = 'id, name, description, category, price, is_veg, image_url, is_available';
const nullableText = (field, max) => body(field).optional({ nullable: true })
  .isString().isLength({ max });
function requirePublicActiveHotel(req, res, next) {
  if (req.hotel.status !== 'active') {
    return next(httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.'));
  }
  return next();
}

/** @openapi
 * /api/hotels:
 *   get:
 *     tags: [Hotels]
 *     summary: List active hotels
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated active hotels
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *       400: { description: Invalid query }
 */
router.get('/', [
  rejectUnknownQuery(['search', 'page', 'limit']),
  query('search').optional().isString().isLength({ max: 255 }),
  ...paginationRules(), validate,
], asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = req.query.search ? `%${req.query.search}%` : null;
  const values = [search, search, search];
  const where = `status = 'active' AND (? IS NULL OR name LIKE ? OR cuisines LIKE ?)`;
  const [countRows] = await dbQuery(`SELECT COUNT(*) AS total FROM hotels WHERE ${where}`, values);
  const [rows] = await dbQuery(
    `SELECT id, name, slug, description, cuisines, address, logo_url, cover_url, accepting_orders
     FROM hotels WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
  const total = Number(countRows[0].total);
  collection(res, rows.map(normalizeHotel), { page, limit, total, totalPages: Math.ceil(total / limit) });
}));

/** @openapi
 * /api/hotels/{hotelId}:
 *   get:
 *     tags: [Hotels]
 *     summary: Get an active hotel
 *     security: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Hotel profile }
 *       400: { description: Invalid hotel ID }
 *       404: { description: Hotel not found }
 */
router.get('/:hotelId', [positiveId('hotelId'), rejectUnknownQuery([]), validate, resolveHotel], asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT id, name, slug, description, cuisines, address, phone, logo_url, cover_url, accepting_orders
     FROM hotels WHERE id = ? AND status = 'active' LIMIT 1`, [req.hotel.id],
  );
  if (!rows.length) throw httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.');
  single(res, normalizeHotel(rows[0]));
}));

/** @openapi
 * /api/hotels/{hotelId}/menu:
 *   get:
 *     tags: [Menu]
 *     summary: Get a hotel's menu grouped by category
 *     security: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: veg
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Menu categories and their items }
 *       404: { description: Hotel not found }
 */
router.get('/:hotelId/menu', [
  positiveId('hotelId'),
  rejectUnknownQuery(['veg']),
  query('veg').optional().isIn(['true', 'false']), validate, resolveHotel, requirePublicActiveHotel,
], asyncHandler(async (req, res) => {
  const veg = req.query.veg === undefined ? null : req.query.veg === 'true';
  const [rows] = await dbQuery(
    `SELECT ${menuFields} FROM menu_items
     WHERE hotel_id = ? AND (? IS NULL OR is_veg = ?)
     ORDER BY category, name LIMIT 500`, [req.hotel.id, veg, veg],
  );
  const categories = [];
  for (const item of rows) {
    let category = categories[categories.length - 1];
    if (!category || category.name !== item.category) {
      category = { name: item.category, items: [] };
      categories.push(category);
    }
    category.items.push(normalizeMenuItem(item));
  }
  single(res, { categories });
}));

/** @openapi
 * /api/hotels/{hotelId}:
 *   patch:
 *     tags: [Hotels]
 *     summary: Update an administered hotel's limited profile
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
 *             minProperties: 1
 *             properties:
 *               description: { type: string, nullable: true }
 *               cuisines: { type: string, nullable: true, maxLength: 160 }
 *               address: { type: string, nullable: true, maxLength: 255 }
 *               phone: { type: string, nullable: true, maxLength: 20 }
 *               logo_url: { type: string, format: uri, nullable: true, maxLength: 500 }
 *               cover_url: { type: string, format: uri, nullable: true, maxLength: 500 }
 *               accepting_orders: { type: boolean }
 *     responses:
 *       200: { description: Updated hotel profile }
 *       400: { description: Invalid profile data }
 *       403: { description: Hotel admin access required or hotel suspended }
 */
router.patch('/:hotelId', [
  authenticate, positiveId('hotelId'), rejectUnknownBody(
    ['description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url', 'accepting_orders'],
    { requireAtLeastOne: true },
  ),
  rejectUnknownQuery([]),
  nullableText('description', 10000), nullableText('cuisines', 160),
  nullableText('address', 255), nullableText('phone', 20),
  httpsUrlRule('logo_url'), httpsUrlRule('cover_url'), booleanRule('accepting_orders'),
  validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const allowed = ['description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url', 'accepting_orders'];
  const fields = allowed.filter((field) => Object.hasOwn(req.body, field));
  const assignments = fields.map((field) => `\`${field}\` = ?`).join(', ');
  await dbQuery(`UPDATE hotels SET ${assignments} WHERE id = ?`, [...fields.map((field) => req.body[field]), req.hotel.id]);
  const [rows] = await dbQuery(
    `SELECT ${hotelFields} FROM hotels WHERE id = ? LIMIT 1`, [req.hotel.id],
  );
  single(res, normalizeHotel(rows[0]));
}));

module.exports = router;
