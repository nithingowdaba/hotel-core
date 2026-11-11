'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const { query: dbQuery, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const {
  positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody, validate,
} = require('./routeUtils');
const { updateOrderState } = require('../services/orderService');

const router = Router();
router.use(authenticate);

/** @openapi
 * /api/me/profile:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the current customer's delivery address
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address: { type: string, maxLength: 255 }
 *     responses:
 *       200: { description: Updated customer profile }
 *       400: { description: Invalid profile data }
 *       401: { description: Authentication required }
 *       403: { description: Customer account required }
 */
router.patch('/profile', [
  rejectUnknownQuery([]),
  rejectUnknownBody(['address'], { requireAtLeastOne: true }),
  body('address').exists().withMessage('address is required.')
    .bail().isString().isLength({ max: 255 })
    .withMessage('address must be at most 255 characters.'),
  validate,
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') {
    throw httpError(403, 'FORBIDDEN', 'Customer profile updates are not available for this account.');
  }
  const address = req.body.address.trim() || null;
  await dbQuery('UPDATE users SET address = ? WHERE id = ?', [address, req.user.id]);
  const [rows] = await dbQuery('SELECT address FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!rows.length) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
  single(res, { ...req.user, address: rows[0].address });
}));

/** @openapi
 * /api/me/addresses:
 *   get:
 *     tags: [Auth]
 *     summary: List the current customer's saved delivery addresses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Saved addresses, with the default address first }
 *       401: { description: Authentication required }
 *       403: { description: Customer account required }
 *   post:
 *     tags: [Auth]
 *     summary: Save a delivery address for the current customer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label, address]
 *             properties:
 *               label: { type: string, maxLength: 60 }
 *               address: { type: string, maxLength: 255 }
 *     responses:
 *       201: { description: Saved address }
 *       400: { description: Invalid address data }
 *       401: { description: Authentication required }
 *       403: { description: Customer account required }
 * /api/me/addresses/{addressId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Remove one of the current customer's saved delivery addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: addressId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Address removed }
 *       401: { description: Authentication required }
 *       403: { description: Customer account required }
 *       404: { description: Address not found }
 */
router.get('/addresses', rejectUnknownQuery([]), validate, asyncHandler(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') {
    throw httpError(403, 'FORBIDDEN', 'Customer address book is not available for this account.');
  }
  const [rows] = await dbQuery(
    `SELECT id, label, address, is_default, created_at
     FROM customer_addresses WHERE user_id = ?
     ORDER BY is_default DESC, id ASC`,
    [req.user.id],
  );
  single(res, rows.map((row) => ({ ...row, is_default: Boolean(row.is_default) })));
}));

router.post('/addresses', [
  rejectUnknownQuery([]),
  rejectUnknownBody(['label', 'address']),
  body('label').exists().bail().isString().trim().isLength({ min: 1, max: 60 })
    .withMessage('label must be between 1 and 60 characters.'),
  body('address').exists().bail().isString().trim().isLength({ min: 1, max: 255 })
    .withMessage('address must be between 1 and 255 characters.'),
  validate,
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') {
    throw httpError(403, 'FORBIDDEN', 'Only customers can save delivery addresses.');
  }
  const saved = await withTransaction(async (connection) => {
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const [existing] = await connection.execute(
      'SELECT id FROM customer_addresses WHERE user_id = ? ORDER BY id LIMIT 1',
      [req.user.id],
    );
    const isDefault = existing.length === 0;
    const [result] = await connection.execute(
      'INSERT INTO customer_addresses (user_id, label, address, is_default) VALUES (?, ?, ?, ?)',
      [req.user.id, req.body.label, req.body.address, isDefault],
    );
    if (isDefault) {
      await connection.execute('UPDATE users SET address = ? WHERE id = ?', [req.body.address, req.user.id]);
    }
    return {
      id: Number(result.insertId),
      label: req.body.label,
      address: req.body.address,
      is_default: isDefault,
    };
  });
  single(res, saved, 201);
}));

router.delete('/addresses/:addressId', [
  positiveId('addressId'),
  rejectUnknownQuery([]),
  validate,
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') {
    throw httpError(403, 'FORBIDDEN', 'Only customers can remove delivery addresses.');
  }
  const removed = await withTransaction(async (connection) => {
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const [rows] = await connection.execute(
      'SELECT id, is_default FROM customer_addresses WHERE id = ? AND user_id = ? FOR UPDATE',
      [req.params.addressId, req.user.id],
    );
    if (!rows.length) return false;
    await connection.execute('DELETE FROM customer_addresses WHERE id = ? AND user_id = ?', [req.params.addressId, req.user.id]);
    if (rows[0].is_default) {
      const [next] = await connection.execute(
        'SELECT id, address FROM customer_addresses WHERE user_id = ? ORDER BY id LIMIT 1',
        [req.user.id],
      );
      if (next.length) {
        await connection.execute('UPDATE customer_addresses SET is_default = TRUE WHERE id = ?', [next[0].id]);
      }
      await connection.execute('UPDATE users SET address = ? WHERE id = ?', [next[0]?.address || null, req.user.id]);
    }
    return true;
  });
  if (!removed) throw httpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  single(res, { deleted: true });
}));

/** @openapi
 * /api/me/hotels:
 *   get:
 *     tags: [Hotels]
 *     summary: List hotels administered by the current user
 *     responses:
 *       200: { description: Hotel memberships and current status }
 *       401: { description: Authentication required }
 */
router.get('/hotels', rejectUnknownQuery([]), validate, asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT h.id AS hotel_id, h.name, h.slug, h.status, h.rejection_reason,
            h.submitted_at, h.approved_at, h.accepting_orders
     FROM hotel_members hm JOIN hotels h ON h.id = hm.hotel_id
     WHERE hm.user_id = ? ORDER BY hm.created_at DESC, hm.hotel_id DESC`, [req.user.id],
  );
  single(res, rows);
}));

function itemSummary(items) {
  let result = items.map((item) => `${item.item_name} x${item.quantity}`).join(', ');
  if (result.length > 255) result = `${result.slice(0, 252)}...`;
  return result;
}

/** @openapi
 * /api/me/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List the current customer's orders
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, completed, cancelled, past] } }
 *     responses:
 *       200: { description: Paginated customer orders with hotel and item summaries }
 *       401: { description: Authentication required }
 */
router.get('/orders', [rejectUnknownQuery(['page', 'limit', 'status']), ...paginationRules(), query('status').optional().isIn(['pending', 'completed', 'cancelled', 'past']), validate], asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const status = req.query.status || null;
  const where = `o.user_id = ? AND (? IS NULL OR
    (? = 'cancelled' AND o.cancelled_at IS NOT NULL) OR
    (? = 'completed' AND o.status = 'completed' AND o.cancelled_at IS NULL) OR
    (? = 'pending' AND o.status = 'pending' AND o.cancelled_at IS NULL) OR
    (? = 'past' AND (o.cancelled_at IS NOT NULL OR o.status = 'completed')))`;
  const args = [req.user.id, status, status, status, status, status];
  const [[countRow]] = await dbQuery(
    `SELECT COUNT(*) AS total FROM orders o JOIN hotels h ON h.id = o.hotel_id WHERE ${where}`,
    args,
  );
  const [rows] = await dbQuery(
    `SELECT o.id, o.hotel_id, o.user_id, o.customer_name, o.phone, o.payment_method, o.total_amount,
            o.status, o.cancelled_at, o.created_at, h.name AS hotel_name, h.slug AS hotel_slug, h.logo_url AS hotel_logo_url
     FROM orders o JOIN hotels h ON h.id = o.hotel_id
     WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset],
  );
  const ids = rows.map((row) => row.id);
  let items = [];
  if (ids.length) [items] = await dbQuery(
    `SELECT oi.order_id, oi.hotel_id, oi.menu_item_id, oi.item_name, oi.unit_price, oi.quantity, oi.subtotal
     FROM order_items oi JOIN orders o ON o.id = oi.order_id AND o.hotel_id = oi.hotel_id
     WHERE o.user_id = ? AND oi.order_id IN (${ids.map(() => '?').join(', ')}) ORDER BY oi.id`, [req.user.id, ...ids],
  );
  const byOrder = new Map();
  for (const item of items) {
    const list = byOrder.get(Number(item.order_id)) || [];
    list.push(item);
    byOrder.set(Number(item.order_id), list);
  }
  const data = rows.map((row) => {
    const orderItems = byOrder.get(Number(row.id)) || [];
    return {
      id: row.id, hotel_id: row.hotel_id,
      hotel: { id: row.hotel_id, name: row.hotel_name, slug: row.hotel_slug, logo_url: row.hotel_logo_url },
      user_id: row.user_id, customer_name: row.customer_name, phone: row.phone,
      payment_method: row.payment_method, total_amount: row.total_amount,
      status: row.cancelled_at ? 'cancelled' : row.status, cancelled_at: row.cancelled_at, created_at: row.created_at,
      item_count: orderItems.length, items_summary: itemSummary(orderItems),
    };
  });
  collection(res, data, { page, limit, total: Number(countRow.total) });
}));

/** @openapi
 * /api/me/orders/{orderId}:
 *   get:
 *     tags: [Orders]
 *     summary: Get one of the current customer's orders
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Order details, hotel, and item snapshots }
 *       401: { description: Authentication required }
 *       404: { description: Order not found }
 */
router.get('/orders/:orderId', [positiveId('orderId'), rejectUnknownQuery([]), validate], asyncHandler(async (req, res) => {
  const [rows] = await dbQuery(
    `SELECT o.*, h.name AS hotel_name, h.slug AS hotel_slug, h.logo_url AS hotel_logo_url
     FROM orders o JOIN hotels h ON h.id = o.hotel_id WHERE o.id = ? AND o.user_id = ? LIMIT 1`, [req.params.orderId, req.user.id],
  );
  if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const [items] = await dbQuery(
    'SELECT menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? AND hotel_id = ? ORDER BY id',
    [req.params.orderId, rows[0].hotel_id],
  );
  const [feedbackRows] = await dbQuery(
    'SELECT rating, comment, created_at FROM order_feedback WHERE order_id = ? AND user_id = ? LIMIT 1',
    [req.params.orderId, req.user.id],
  );
  const { hotel_name, hotel_slug, hotel_logo_url, ...order } = rows[0];
  single(res, { ...order, status: order.cancelled_at ? 'cancelled' : order.status,
    hotel: { id: order.hotel_id, name: hotel_name, slug: hotel_slug, logo_url: hotel_logo_url },
    items, feedback: feedbackRows[0] || null });
}));

/** @openapi
 * /api/me/orders/{orderId}/feedback:
 *   post:
 *     tags: [Orders]
 *     summary: Submit one rating for an order completed by the current customer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, maxLength: 2000, nullable: true }
 *     responses:
 *       201: { description: Feedback saved }
 *       400: { description: Invalid rating or comment }
 *       401: { description: Authentication required }
 *       403: { description: Customer account required }
 *       404: { description: Order not found }
 *       409: { description: Order is not complete or already has feedback }
 */
router.post('/orders/:orderId/feedback', [
  positiveId('orderId'),
  rejectUnknownQuery([]),
  rejectUnknownBody(['rating', 'comment']),
  body('rating').exists().withMessage('rating is required.')
    .bail().isInt({ min: 1, max: 5 }).toInt()
    .withMessage('rating must be an integer from 1 to 5.'),
  body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 2000 })
    .withMessage('comment must be at most 2000 characters.'),
  validate,
], asyncHandler(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') {
    throw httpError(403, 'FORBIDDEN', 'Only customers can submit order feedback.');
  }
  const [orders] = await dbQuery(
    'SELECT id, hotel_id, status, cancelled_at FROM orders WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.orderId, req.user.id],
  );
  if (!orders.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (orders[0].status !== 'completed' || orders[0].cancelled_at) {
    throw httpError(409, 'ORDER_NOT_COMPLETED', 'Feedback is available after the order is completed.');
  }
  const [existing] = await dbQuery(
    'SELECT order_id FROM order_feedback WHERE order_id = ? LIMIT 1', [orders[0].id],
  );
  if (existing.length) throw httpError(409, 'FEEDBACK_ALREADY_SUBMITTED', 'Feedback has already been submitted.');

  const comment = req.body.comment?.trim() || null;
  try {
    await dbQuery(
      'INSERT INTO order_feedback (order_id, hotel_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [orders[0].id, orders[0].hotel_id, req.user.id, req.body.rating, comment],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'FEEDBACK_ALREADY_SUBMITTED', 'Feedback has already been submitted.');
    }
    throw error;
  }
  const [feedback] = await dbQuery(
    'SELECT rating, comment, created_at FROM order_feedback WHERE order_id = ? AND user_id = ? LIMIT 1',
    [orders[0].id, req.user.id],
  );
  single(res, feedback[0], 201);
}));

/** @openapi
 * /api/me/orders/{orderId}/cancel:
 *   patch:
 *     tags: [Orders]
 *     summary: Cancel a pending order belonging to the current customer
 *     parameters:
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Cancelled order }
 *       401: { description: Authentication required }
 *       404: { description: Order not found }
 *       409: { description: Cancellation is not allowed }
 */
router.patch('/orders/:orderId/cancel', [positiveId('orderId'), rejectUnknownQuery([]), validate], asyncHandler(async (req, res) => {
  await updateOrderState({ orderId: req.params.orderId, userId: req.user.id, nextState: 'cancelled' });
  const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [req.params.orderId, req.user.id]);
  const [items] = await dbQuery('SELECT menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? AND hotel_id = ? ORDER BY id', [req.params.orderId, rows[0].hotel_id]);
  single(res, { ...rows[0], status: 'cancelled', items });
}));

module.exports = router;
