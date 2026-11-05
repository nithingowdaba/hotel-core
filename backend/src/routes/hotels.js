'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query: dbQuery, withTransaction } = require('../config/db');
const env = require('../config/env');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { resolveHotel, requireHotelAdmin, requireVisibleHotel } = require('../middleware/tenant');
const { hotelRegistrationLimiter } = require('../middleware/rateLimit');
const { buildAuthToken } = require('../utils/auth');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const {
  positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody,
  httpsUrlRule, booleanRule, normalizeHotel, normalizeMenuItem, escapeLike, validate,
} = require('./routeUtils');

const router = Router();
const hotelFields = `id, name, slug, description, cuisines, address, phone, logo_url,
  cover_url, accepting_orders, status, rejection_reason, submitted_at, approved_at`;
const menuFields = 'id, name, description, category, price, is_veg, image_url, is_available';
const nullableText = (field, max) => body(field).optional({ nullable: true })
  .isString().isLength({ max });
function requirePublicActiveHotel(req, res, next) {
  return requireVisibleHotel(req, res, next);
}

const registrationHotelFields = ['name', 'phone', 'address', 'cuisine', 'cuisines', 'description', 'image_url'];
function registrationBodyRule() {
  return body().custom((value, { req }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Body must be a JSON object.');
    const isObject = (candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate);
    const exactKeys = (candidate, allowed, required = []) => isObject(candidate)
      && Object.keys(candidate).every((key) => allowed.includes(key))
      && required.every((key) => Object.hasOwn(candidate, key));
    if (!exactKeys(value.hotel, registrationHotelFields, ['name', 'phone'])) {
      throw new Error('Provide hotel details with name and phone.');
    }
    if (Object.hasOwn(value.hotel, 'cuisine') && Object.hasOwn(value.hotel, 'cuisines')) {
      throw new Error('Provide cuisine or cuisines, not both.');
    }
    if (req.user) {
      if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'hotel')) {
        throw new Error('Authenticated registration accepts hotel details only.');
      }
    } else if (Object.keys(value).length !== 2
      || !exactKeys(value.owner, ['name', 'email', 'password'], ['name', 'email', 'password'])) {
      throw new Error('Anonymous registration requires owner name, email, password, and hotel details.');
    }
    return true;
  });
}

function hotelSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** @openapi
 * /api/hotels/register:
 *   post:
 *     tags: [Hotels]
 *     summary: Register a hotel for platform approval
 *     description: Anonymous requests provide owner and hotel objects and receive a session token. Authenticated requests provide only the hotel object. Slug collisions return SLUG_IN_USE; AUTO_APPROVE_HOTELS=true activates self-registrations immediately.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hotel]
 *             properties:
 *               owner:
 *                 type: object
 *                 required: [name, email, password]
 *                 properties:
 *                   name: { type: string, minLength: 1, maxLength: 120 }
 *                   email: { type: string, format: email, maxLength: 255 }
 *                   password: { type: string, minLength: 8, maxLength: 72 }
 *               hotel:
 *                 type: object
 *                 required: [name, phone]
 *                 properties:
 *                   name: { type: string, minLength: 1, maxLength: 120 }
 *                   phone: { type: string, minLength: 1, maxLength: 20 }
 *                   address: { type: string, maxLength: 255 }
 *                   cuisines: { type: string, maxLength: 160 }
 *                   description: { type: string, maxLength: 10000 }
 *                   image_url: { type: string, format: uri, description: Optional HTTPS cover image }
 *     responses:
 *       201: { description: Hotel created with membership; anonymous registration also returns a token and user }
 *       400: { description: Invalid registration details }
 *       409: { description: EMAIL_IN_USE or SLUG_IN_USE }
 *       429: { description: Hotel registration rate limit reached }
 */
router.post('/register', hotelRegistrationLimiter, optionalAuthenticate, [
  rejectUnknownQuery([]), registrationBodyRule(),
  body('owner.name').if((_value, { req }) => !req.user).trim().isString().isLength({ min: 1, max: 120 }),
  body('owner.email').if((_value, { req }) => !req.user).trim().isEmail().isLength({ max: 255 }),
  body('owner.password').if((_value, { req }) => !req.user).isString().isLength({ min: 8, max: 72 }),
  body('hotel.name').trim().isString().isLength({ min: 1, max: 120 }),
  body('hotel.phone').trim().isString().isLength({ min: 1, max: 20 }),
  body('hotel.address').if((_value, { req }) => Object.hasOwn(req.body?.hotel || {}, 'address'))
    .optional({ nullable: true }).trim().isString().isLength({ max: 255 }),
  body('hotel.cuisine').if((_value, { req }) => Object.hasOwn(req.body?.hotel || {}, 'cuisine'))
    .optional({ nullable: true }).trim().isString().isLength({ max: 160 }),
  body('hotel.cuisines').if((_value, { req }) => Object.hasOwn(req.body?.hotel || {}, 'cuisines'))
    .optional({ nullable: true }).trim().isString().isLength({ max: 160 }),
  body('hotel.description').if((_value, { req }) => Object.hasOwn(req.body?.hotel || {}, 'description'))
    .optional({ nullable: true }).trim().isString().isLength({ max: 10000 }),
  body('hotel.image_url').if((_value, { req }) => Object.hasOwn(req.body?.hotel || {}, 'image_url'))
    .optional({ nullable: true }).isString().isLength({ max: 500 }).bail()
    .isURL({ protocols: ['https'], require_protocol: true }),
  validate,
], asyncHandler(async (req, res) => {
  const hotel = req.body.hotel;
  const name = hotel.name.trim();
  const slug = hotelSlug(name);
  if (!slug) throw httpError(400, 'VALIDATION_ERROR', 'Hotel name must contain letters or numbers.');
  const autoApprove = env.autoApproveHotels;
  const status = autoApprove ? 'active' : 'pending';
  const email = req.user ? null : req.body.owner.email.trim().toLowerCase();
  const userName = req.user ? null : req.body.owner.name.trim();
  const passwordHash = req.user ? null : await bcrypt.hash(req.body.owner.password, 12);
  let userId = req.user?.id;
  let createdUser;
  let createdHotel;
  try {
    await withTransaction(async (connection) => {
      if (req.user) {
        const [lockedUsers] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
        if (!lockedUsers.length) throw httpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
        const [[pendingCount]] = await connection.execute(
          `SELECT COUNT(*) AS total FROM hotels h
           JOIN hotel_members hm ON hm.hotel_id = h.id
           WHERE hm.user_id = ? AND h.status = 'pending'`, [req.user.id],
        );
        if (Number(pendingCount.total) >= 3) {
          throw httpError(409, 'HOTEL_LIMIT_REACHED', 'You may have up to three hotels awaiting approval.');
        }
      } else {
        const [existingUsers] = await connection.execute(
          'SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email],
        );
        if (existingUsers.length) {
          throw httpError(409, 'EMAIL_IN_USE', 'An account with this email already exists. Log in to register a hotel.');
        }
        const [userResult] = await connection.execute(
          `INSERT INTO users (full_name, email, phone, password_hash, role)
           VALUES (?, ?, ?, ?, 'CUSTOMER')`,
          [userName, email, hotel.phone.trim(), passwordHash],
        );
        userId = userResult.insertId;
        createdUser = { id: Number(userId), full_name: userName, email, phone: hotel.phone.trim(), role: 'CUSTOMER' };
      }

      const [existingSlugs] = await connection.execute('SELECT id FROM hotels WHERE slug = ? LIMIT 1', [slug]);
      if (existingSlugs.length) throw httpError(409, 'SLUG_IN_USE', 'That hotel name is already registered.');
      const [hotelResult] = await connection.execute(
        `INSERT INTO hotels
          (name, slug, description, cuisines, address, phone, cover_url, status, submitted_at, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, NULL)`,
        [name, slug, hotel.description?.trim() || null,
          (hotel.cuisine ?? hotel.cuisines)?.trim() || null, hotel.address?.trim() || null,
          hotel.phone.trim(), hotel.image_url?.trim() || null, status,
          autoApprove ? new Date() : null],
      );
      createdHotel = { id: Number(hotelResult.insertId), name, slug, description: hotel.description?.trim() || null,
        cuisines: (hotel.cuisine ?? hotel.cuisines)?.trim() || null, address: hotel.address?.trim() || null,
        phone: hotel.phone.trim(), cover_url: hotel.image_url?.trim() || null, accepting_orders: true,
        status, rejection_reason: null };
      await connection.execute(
        `INSERT INTO hotel_members (user_id, hotel_id, role) VALUES (?, ?, 'ADMIN')`, [userId, hotelResult.insertId],
      );
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      if (String(error.message).includes('uq_users_email')) {
        throw httpError(409, 'EMAIL_IN_USE', 'An account with this email already exists. Log in to register a hotel.');
      }
      if (String(error.message).includes('uq_hotels_slug')) {
        throw httpError(409, 'SLUG_IN_USE', 'That hotel name is already registered.');
      }
    }
    throw error;
  }
  const data = req.user
    ? { hotel: createdHotel }
    : { token: buildAuthToken(createdUser), user: createdUser, hotel: createdHotel };
  single(res, data, 201);
}));

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
  const search = req.query.search ? `%${escapeLike(req.query.search)}%` : null;
  const values = [search, search, search];
  const where = `status = 'active' AND (? IS NULL OR name LIKE ? ESCAPE '!' OR cuisines LIKE ? ESCAPE '!')`;
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
router.get('/:hotelId', [optionalAuthenticate, positiveId('hotelId'), rejectUnknownQuery([]), validate, resolveHotel, requireVisibleHotel], asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT ${hotelFields} FROM hotels WHERE id = ? LIMIT 1`, [req.hotel.id],
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
  optionalAuthenticate, positiveId('hotelId'),
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
  if (req.hotel.status !== 'active' && Object.hasOwn(req.body, 'accepting_orders')) {
    throw httpError(409, 'HOTEL_NOT_ACTIVE', 'Order availability can only be changed after approval.');
  }
  const allowed = ['description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url', 'accepting_orders'];
  const fields = allowed.filter((field) => Object.hasOwn(req.body, field));
  const assignments = fields.map((field) => `\`${field}\` = ?`).join(', ');
  await dbQuery(`UPDATE hotels SET ${assignments} WHERE id = ?`, [...fields.map((field) => req.body[field]), req.hotel.id]);
  const [rows] = await dbQuery(
    `SELECT ${hotelFields} FROM hotels WHERE id = ? LIMIT 1`, [req.hotel.id],
  );
  single(res, normalizeHotel(rows[0]));
}));

/** @openapi
 * /api/hotels/{hotelId}/resubmit:
 *   post:
 *     tags: [Hotels]
 *     summary: Resubmit a rejected hotel for platform approval
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Hotel returned to pending review }
 *       403: { description: Hotel administrator access required }
 *       404: { description: Hotel not found }
 *       409: { description: Only rejected hotels can be resubmitted }
 */
router.post('/:hotelId/resubmit', [
  authenticate, positiveId('hotelId'), rejectUnknownQuery([]), rejectUnknownBody([]), validate,
  resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  await withTransaction(async (connection) => {
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const [[pendingCount]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM hotels h JOIN hotel_members hm ON hm.hotel_id = h.id
       WHERE hm.user_id = ? AND h.status = 'pending'`, [req.user.id],
    );
    if (Number(pendingCount.total) >= 3) {
      throw httpError(409, 'HOTEL_LIMIT_REACHED', 'You may have up to three hotels awaiting approval.');
    }
    const [result] = await connection.execute(
      `UPDATE hotels SET status = 'pending', rejection_reason = NULL,
         submitted_at = CURRENT_TIMESTAMP, approved_at = NULL, approved_by = NULL
       WHERE id = ? AND status = 'rejected'`, [req.hotel.id],
    );
    if (!result.affectedRows) {
      throw httpError(409, 'INVALID_HOTEL_TRANSITION', 'Only rejected hotels can be resubmitted.');
    }
  });
  const [rows] = await dbQuery(`SELECT ${hotelFields} FROM hotels WHERE id = ?`, [req.hotel.id]);
  single(res, normalizeHotel(rows[0]));
}));

module.exports = router;
