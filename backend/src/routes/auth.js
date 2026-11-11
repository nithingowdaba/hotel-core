'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const validate = require('../../middleware/validate');
const { buildAuthToken } = require('../utils/auth');
const { asyncHandler, httpError, single } = require('../utils/http');

const router = Router();

const registrationValidation = [
  body('full_name').isString().trim().isLength({ min: 1, max: 120 }),
  body('email').trim().isEmail().isLength({ max: 255 }),
  body('phone').isString().trim().isLength({ min: 1, max: 20 }),
  body('password').isString().isLength({ min: 8, max: 72 }),
];

/** @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a customer account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, phone, password]
 *             properties:
 *               full_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 120
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *               phone:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 20
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 72
 *     responses:
 *       201:
 *         description: Customer account created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       required: [id, full_name, email, phone, role]
 *                       properties:
 *                         id: { type: integer }
 *                         full_name: { type: string }
 *                         email: { type: string, format: email }
 *                         phone: { type: string }
 *                         role: { type: string, enum: [CUSTOMER], example: CUSTOMER }
 *       400:
 *         description: Request validation failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Email is already in use
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/register', authLimiter, registrationValidation, validate, asyncHandler(async (req, res) => {
  const fullName = req.body.full_name.trim();
  const email = req.body.email.trim().toLowerCase();
  const phone = req.body.phone.trim();
  const password = req.body.password;

  const [existing] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw httpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES (?, ?, ?, ?, 'CUSTOMER')`,
    [fullName, email, phone, passwordHash],
  );
  single(res, { id: result.insertId, full_name: fullName, email, phone, role: 'CUSTOMER' }, 201);
}));

/** @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *               password:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 72
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       required: [token, user]
 *                       properties:
 *                         token: { type: string, description: JWT access token }
 *                         user:
 *                           type: object
 *                           required: [id, full_name, email, phone, role]
 *                           properties:
 *                             id: { type: integer }
 *                             full_name: { type: string }
 *                             email: { type: string, format: email }
 *                             phone: { type: string }
 *                             role: { type: string }
 *       400:
 *         description: Request validation failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid credentials or inactive account
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login', authLimiter, [
  body('email').trim().isEmail().isLength({ max: 255 }),
  body('password').isString().isLength({ min: 1, max: 72 }),
], validate, asyncHandler(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const [rows] = await query(
    `SELECT id, full_name, email, phone, password_hash, role, is_active
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  const user = rows[0];
  const validPassword = user ? await bcrypt.compare(req.body.password, user.password_hash) : false;
  if (!user || !validPassword) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (!user.is_active) throw httpError(401, 'ACCOUNT_INACTIVE', 'This account is inactive.');

  const safeUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
  single(res, { token: buildAuthToken(user), user: safeUser });
}));

/** @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Return the authenticated user and hotel memberships
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user and hotel memberships
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id: { type: integer }
 *                         full_name: { type: string }
 *                         email: { type: string, format: email }
 *                         phone: { type: string }
 *                         address: { type: string, nullable: true }
 *                         role: { type: string }
 *                         admin_of:
 *                           type: array
 *                           items:
 *                             type: object
 *                             required: [hotel_id, name, slug]
 *                             properties:
 *                               hotel_id: { type: integer }
 *                               name: { type: string }
 *                               slug: { type: string }
 *       401:
 *         description: Authentication required or token is invalid or expired
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const [memberships] = await query(
    `SELECT h.id AS hotel_id, h.name, h.slug
     FROM hotel_members hm
     JOIN hotels h ON h.id = hm.hotel_id
     WHERE hm.user_id = ?
     ORDER BY h.id`,
    [req.user.id],
  );
  single(res, { ...req.user, admin_of: memberships });
}));

module.exports = router;
