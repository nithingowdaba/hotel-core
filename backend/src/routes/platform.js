'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query: dbQuery, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { snapshot: metricsSnapshot } = require('../middleware/metrics');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const {
  positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody,
  httpsUrlRule, requirePlatformAdmin, normalizeHotel, escapeLike, validate,
} = require('./routeUtils');

const router = Router();
router.use(authenticate, requirePlatformAdmin);

/** @openapi
 * /api/platform/metrics:
 *   get:
 *     tags: [Platform]
 *     summary: Get in-memory request metrics
 *     responses:
 *       200: { description: Per-route request counts and latency percentiles }
 *       401: { description: Authentication required }
 *       403: { description: Platform administrator access required }
 */
router.get('/metrics', rejectUnknownQuery([]), validate, asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT COUNT(*) AS total_hotels,
            SUM(status = 'active') AS active_hotels,
            SUM(status = 'suspended') AS suspended_hotels,
            SUM(status = 'pending') AS legacy_pending_hotels,
            SUM(status = 'rejected') AS legacy_rejected_hotels
     FROM hotels`,
  );
  single(res, {
    ...metricsSnapshot(),
    total_hotels: Number(rows[0].total_hotels || 0),
    active_hotels: Number(rows[0].active_hotels || 0),
    suspended_hotels: Number(rows[0].suspended_hotels || 0),
    legacy_pending_hotels: Number(rows[0].legacy_pending_hotels || 0),
    legacy_rejected_hotels: Number(rows[0].legacy_rejected_hotels || 0),
  });
}));
const nullableText = (field, max) => body(field).optional({ nullable: true })
  .isString().isLength({ max });
const slugRule = (field, optional = true) => {
  const rule = body(field);
  if (optional) rule.optional();
  return rule.isString().isLength({ min: 1, max: 80 }).bail().matches(/^[a-z0-9-]+$/);
};

function generatedSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

async function ensureHotel(hotelId) {
  const [rows] = await dbQuery('SELECT id FROM hotels WHERE id = ? LIMIT 1', [hotelId]);
  if (!rows.length) throw httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.');
}

/** @openapi
 * /api/platform/hotels:
 *   post:
 *     tags: [Hotels]
 *     summary: Create a hotel
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               slug: { type: string, pattern: '^[a-z0-9-]+$', maxLength: 80 }
 *               description: { type: string, nullable: true }
 *               cuisines: { type: string, nullable: true, maxLength: 160 }
 *               address: { type: string, nullable: true, maxLength: 255 }
 *               phone: { type: string, nullable: true, maxLength: 20 }
 *     responses:
 *       201: { description: Hotel created }
 *       400: { description: Invalid hotel data }
 *       403: { description: Platform administrator access required }
 *       409: { description: Slug already in use }
 */
router.post('/hotels', [
  rejectUnknownBody(['name', 'slug', 'description', 'cuisines', 'address', 'phone']),
  rejectUnknownQuery([]),
  body('name').trim().isString().isLength({ min: 1, max: 120 }), slugRule('slug'),
  nullableText('description', 10000), nullableText('cuisines', 160),
  nullableText('address', 255), nullableText('phone', 20), validate,
], asyncHandler(async (req, res) => {
  const slug = req.body.slug || generatedSlug(req.body.name);
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Hotel name does not produce a valid slug.');
  }
  try {
    const [result] = await dbQuery(
      `INSERT INTO hotels (name, slug, description, cuisines, address, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.body.name, slug, req.body.description ?? null, req.body.cuisines ?? null,
        req.body.address ?? null, req.body.phone ?? null],
    );
    const [rows] = await dbQuery(
      `SELECT id, name, slug, description, cuisines, address, phone, logo_url, cover_url,
              accepting_orders, status
       FROM hotels WHERE id = ?`, [result.insertId],
    );
    return single(res, normalizeHotel(rows[0]), 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'SLUG_IN_USE', 'That hotel slug is already in use.');
    throw err;
  }
}));

/** @openapi
 * /api/platform/hotels:
 *   get:
 *     tags: [Hotels]
 *     summary: List all hotels with administrator counts
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 120 }
 *     responses:
 *       200: { description: Paginated hotels across all statuses }
 *       403: { description: Platform administrator access required }
 */
router.get('/hotels', [
  rejectUnknownQuery(['page', 'limit', 'search', 'status']), ...paginationRules(),
  query('search').optional().isString().trim().isLength({ max: 120 }),
  query('status').optional().isIn(['active', 'suspended', 'pending', 'rejected']), validate,
], asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = String(req.query.search ?? '').trim();
  const status = req.query.status || null;
  const term = `%${escapeLike(search)}%`;
  const where = `(? = '' OR h.name LIKE ? ESCAPE '!' OR h.slug LIKE ? ESCAPE '!')
    AND (? IS NULL OR h.status = ?)`;
  const [countRows] = await dbQuery(
    `SELECT COUNT(*) AS total FROM hotels h WHERE ${where}`, [search, term, term, status, status],
  );
  const [rows] = await dbQuery(
    `SELECT h.id, h.name, h.slug, h.description, h.cuisines, h.address, h.phone,
            h.logo_url, h.cover_url, h.accepting_orders, h.status, h.created_at,
            h.rejection_reason, h.submitted_at, h.approved_at,
            COUNT(hm.user_id) AS admin_count,
            (SELECT u.full_name FROM hotel_members owner_m JOIN users u ON u.id = owner_m.user_id
             WHERE owner_m.hotel_id = h.id ORDER BY owner_m.created_at, owner_m.user_id LIMIT 1) AS owner_name,
            (SELECT u.email FROM hotel_members owner_m JOIN users u ON u.id = owner_m.user_id
             WHERE owner_m.hotel_id = h.id ORDER BY owner_m.created_at, owner_m.user_id LIMIT 1) AS owner_email
     FROM hotels h LEFT JOIN hotel_members hm ON hm.hotel_id = h.id
     WHERE ${where}
     GROUP BY h.id ORDER BY h.id LIMIT ? OFFSET ?`, [search, term, term, status, status, limit, offset],
  );
  const total = Number(countRows[0].total);
  collection(res, rows.map(normalizeHotel), { page, limit, total, totalPages: Math.ceil(total / limit) });
}));

/** @openapi
 * /api/platform/hotels/{hotelId}:
 *   patch:
 *     tags: [Hotels]
 *     summary: Update a platform-managed hotel
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
 *               name: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, nullable: true }
 *               cuisines: { type: string, nullable: true, maxLength: 160 }
 *               address: { type: string, nullable: true, maxLength: 255 }
 *               phone: { type: string, nullable: true, maxLength: 20 }
 *               logo_url: { type: string, format: uri, nullable: true, maxLength: 500 }
 *               cover_url: { type: string, format: uri, nullable: true, maxLength: 500 }
 *               status: { type: string, enum: [active, suspended] }
 *     responses:
 *       200: { description: Updated hotel }
 *       400: { description: Invalid update }
 *       403: { description: Platform administrator access required }
 *       404: { description: Hotel not found }
 */
const platformHotelFields = ['name', 'description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url', 'status'];
router.patch('/hotels/:hotelId', [
  positiveId('hotelId'), rejectUnknownQuery([]), rejectUnknownBody(platformHotelFields, { requireAtLeastOne: true }),
  body('name').optional().trim().isString().isLength({ min: 1, max: 120 }),
  nullableText('description', 10000), nullableText('cuisines', 160),
  nullableText('address', 255), nullableText('phone', 20),
  httpsUrlRule('logo_url'), httpsUrlRule('cover_url'),
  body('status').optional().isIn(['active', 'suspended']), validate,
], asyncHandler(async (req, res) => {
  await ensureHotel(req.params.hotelId);
  const [[current]] = await dbQuery('SELECT status FROM hotels WHERE id = ? LIMIT 1', [req.params.hotelId]);
  if (Object.hasOwn(req.body, 'status')) {
    if (!['active', 'suspended'].includes(current.status)
      && !(req.body.status === 'active' && ['pending', 'rejected'].includes(current.status))) {
      throw httpError(409, 'INVALID_HOTEL_TRANSITION', 'Legacy inactive hotels can only be explicitly activated by a platform administrator.');
    }
  }
  const keys = platformHotelFields.filter((field) => Object.hasOwn(req.body, field));
  const resolvingLegacyHotel = Object.hasOwn(req.body, 'status')
    && req.body.status === 'active' && ['pending', 'rejected'].includes(current.status);
  const assignments = keys.map((field) => `\`${field}\` = ?`);
  if (resolvingLegacyHotel) {
    assignments.push('rejection_reason = NULL', 'submitted_at = NULL', 'approved_at = NULL', 'approved_by = NULL');
  }
  try {
    await dbQuery(
      `UPDATE hotels SET ${assignments.join(', ')} WHERE id = ?`,
      [...keys.map((field) => req.body[field]), req.params.hotelId],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'SLUG_IN_USE', 'Hotel update conflicts with an existing value.');
    throw err;
  }
  const [rows] = await dbQuery(
    `SELECT id, name, slug, description, cuisines, address, phone, logo_url, cover_url,
            accepting_orders, status
     FROM hotels WHERE id = ?`, [req.params.hotelId],
  );
  single(res, normalizeHotel(rows[0]));
}));

/** @openapi
 * /api/platform/hotels/{hotelId}/admins:
 *   get:
 *     tags: [Hotels]
 *     summary: List a hotel's administrators
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200: { description: Paginated hotel administrators }
 *       404: { description: Hotel not found }
 */
router.get('/hotels/:hotelId/admins', [
  positiveId('hotelId'), rejectUnknownQuery(['page', 'limit']), ...paginationRules(), validate,
], asyncHandler(async (req, res) => {
  await ensureHotel(req.params.hotelId);
  const { page, limit, offset } = pagination(req);
  const [countRows] = await dbQuery(
    'SELECT COUNT(*) AS total FROM hotel_members WHERE hotel_id = ?', [req.params.hotelId],
  );
  const [rows] = await dbQuery(
    `SELECT u.id, u.full_name, u.email, u.phone
     FROM hotel_members hm JOIN users u ON u.id = hm.user_id
     WHERE hm.hotel_id = ? ORDER BY u.full_name, u.id LIMIT ? OFFSET ?`, [req.params.hotelId, limit, offset],
  );
  const total = Number(countRows[0].total);
  collection(res, rows, { page, limit, total, totalPages: Math.ceil(total / limit) });
}));

/** @openapi
 * /api/platform/hotels/{hotelId}/admins:
 *   post:
 *     tags: [Hotels]
 *     summary: Link an existing user or create and link a hotel administrator
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
 *             oneOf:
 *               - type: object
 *                 required: [user_id]
 *                 properties:
 *                   user_id: { type: integer, minimum: 1 }
 *               - type: object
 *                 required: [email]
 *                 properties:
 *                   email: { type: string, format: email, maxLength: 255, description: Case-insensitive email of an existing active customer }
 *               - type: object
 *                 required: [full_name, email, phone, password]
 *                 properties:
 *                   full_name: { type: string, minLength: 1, maxLength: 120 }
 *                   email: { type: string, format: email, maxLength: 255 }
 *                   phone: { type: string, minLength: 1, maxLength: 20 }
 *                   password: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       201: { description: Existing eligible customer linked or new customer created and linked }
 *       400: { description: Invalid or mixed administrator modes }
 *       404: { description: Hotel not found or generic USER_NOT_FOUND for an ineligible or unknown link target }
 *       409: { description: User is already an administrator or email is in use }
 */
router.post('/hotels/:hotelId/admins', [
  positiveId('hotelId'), rejectUnknownQuery([]),
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Body must be a JSON object.');
    const keys = Object.keys(value);
    const linkMode = keys.length === 1 && ['user_id', 'email'].includes(keys[0]);
    const createFields = ['full_name', 'email', 'phone', 'password'];
    const createMode = keys.length === createFields.length && createFields.every((key) => keys.includes(key));
    if (!linkMode && !createMode) throw new Error('Provide exactly one link selector (user_id or email) or all creation fields.');
    return true;
  }),
  body('user_id').if((value, { req }) => Object.hasOwn(req.body, 'user_id'))
    .matches(/^[1-9]\d*$/).bail().custom((value) => Number.isSafeInteger(Number(value))),
  body('full_name').if((value, { req }) => Object.hasOwn(req.body, 'full_name'))
    .trim().isString().isLength({ min: 1, max: 120 }),
  body('email').if((value, { req }) => Object.hasOwn(req.body, 'email'))
    .trim().isEmail().isLength({ max: 255 }),
  body('phone').if((value, { req }) => Object.hasOwn(req.body, 'phone'))
    .trim().isString().isLength({ min: 1, max: 20 }),
  body('password').if((value, { req }) => Object.hasOwn(req.body, 'password'))
    .isString().isLength({ min: 8, max: 72 }), validate,
], asyncHandler(async (req, res) => {
  await ensureHotel(req.params.hotelId);
  let userId;
  const linkMode = req.body.user_id !== undefined || req.body.full_name === undefined;
  if (linkMode) {
    const [users] = req.body.user_id !== undefined
      ? await dbQuery(
        `SELECT id FROM users WHERE id = ? AND role = 'CUSTOMER' AND is_active = TRUE LIMIT 1`, [req.body.user_id],
      )
      : await dbQuery(
        `SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND role = 'CUSTOMER' AND is_active = TRUE LIMIT 1`, [req.body.email],
      );
    if (!users.length) throw httpError(404, 'USER_NOT_FOUND', 'Eligible user not found.');
    userId = users[0].id;
    try {
      await dbQuery('INSERT INTO hotel_members (user_id, hotel_id) VALUES (?, ?)', [userId, req.params.hotelId]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'ALREADY_HOTEL_ADMIN', 'User is already an administrator of this hotel.');
      throw err;
    }
  } else {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    try {
      userId = await withTransaction(async (connection) => {
        const [inserted] = await connection.execute(
          `INSERT INTO users (full_name, email, phone, password_hash, role)
           VALUES (?, ?, ?, ?, 'CUSTOMER')`,
          [req.body.full_name, req.body.email.trim().toLowerCase(), req.body.phone, passwordHash],
        );
        const createdUserId = inserted.insertId;
        try {
          await connection.execute(
            'INSERT INTO hotel_members (user_id, hotel_id) VALUES (?, ?)', [createdUserId, req.params.hotelId],
          );
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'ALREADY_HOTEL_ADMIN', 'User is already an administrator of this hotel.');
          throw err;
        }
        return createdUserId;
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
      throw err;
    }
  }
  const [rows] = await dbQuery(
    'SELECT id, full_name, email, phone FROM users WHERE id = ? LIMIT 1', [userId],
  );
  single(res, rows[0], 201);
}));

/** @openapi
 * /api/platform/hotels/{hotelId}/admins/{userId}:
 *   delete:
 *     tags: [Hotels]
 *     summary: Remove a hotel administrator link
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Hotel administrator link removed; user account remains }
 *       404: { description: Hotel or administrator link not found }
 */
router.delete('/hotels/:hotelId/admins/:userId', [
  positiveId('hotelId'), positiveId('userId'), rejectUnknownQuery([]), validate,
], asyncHandler(async (req, res) => {
  await ensureHotel(req.params.hotelId);
  const [result] = await dbQuery(
    'DELETE FROM hotel_members WHERE hotel_id = ? AND user_id = ?', [req.params.hotelId, req.params.userId],
  );
  if (!result.affectedRows) throw httpError(404, 'HOTEL_ADMIN_NOT_FOUND', 'Hotel administrator link not found.');
  single(res, { hotel_id: Number(req.params.hotelId), user_id: Number(req.params.userId), removed: true });
}));

module.exports = router;
