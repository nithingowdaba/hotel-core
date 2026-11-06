'use strict';

const { Router } = require('express');
const { query } = require('express-validator');
const { query: dbQuery } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const { positiveId, paginationRules, pagination, rejectUnknownQuery, validate } = require('./routeUtils');
const { updateOrderState } = require('../services/orderService');

const router = Router();
router.use(authenticate);

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
  const { hotel_name, hotel_slug, hotel_logo_url, ...order } = rows[0];
  single(res, { ...order, status: order.cancelled_at ? 'cancelled' : order.status,
    hotel: { id: order.hotel_id, name: hotel_name, slug: hotel_slug, logo_url: hotel_logo_url }, items });
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
