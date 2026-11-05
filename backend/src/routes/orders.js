'use strict';

const { Router } = require('express');
const { body, query } = require('express-validator');
const { query: dbQuery } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { resolveHotel, requireHotelAdmin, requireOrderableHotel } = require('../middleware/tenant');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const { positiveId, paginationRules, pagination, rejectUnknownQuery, rejectUnknownBody, validate } = require('./routeUtils');
const { istDateToUtc, shiftDate } = require('../utils/time');
const { createOrder, updateOrderState } = require('../services/orderService');

const router = Router();

/** @openapi
 * /api/hotels/{hotelId}/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order at a hotel
 *     security: [{ bearerAuth: [] }]
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
 *             additionalProperties: false
 *             required: [items, payment_method]
 *             properties:
 *               payment_method: { type: string, enum: [cash, upi, card] }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   additionalProperties: false
 *                   required: [menu_item_id, quantity]
 *                   properties:
 *                     menu_item_id: { type: integer, minimum: 1 }
 *                     quantity: { type: integer, minimum: 1, maximum: 999 }
 *     responses:
 *       201: { description: Order created with database menu prices }
 *       400: { description: Invalid order or menu item }
 *       401: { description: Authentication required }
 *       404: { description: Hotel not found }
 *       409: { description: Hotel is not accepting orders or an item is unavailable }
 */
router.post('/:hotelId/orders', [
  authenticate, positiveId('hotelId'), rejectUnknownQuery([]),
  rejectUnknownBody(['items', 'payment_method']),
  body('payment_method').isIn(['cash', 'upi', 'card']),
  body('items').isArray({ min: 1, max: 50 }).bail().custom((items) => items.every((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).every((key) => ['menu_item_id', 'quantity'].includes(key)))),
  body('items.*.menu_item_id').matches(/^[1-9]\d*$/).bail().custom((value) => Number.isSafeInteger(Number(value))),
  body('items.*.quantity').matches(/^[1-9]\d*$/).bail().custom((value) => Number(value) <= 999),
  validate, resolveHotel, requireOrderableHotel,
], asyncHandler(async (req, res) => {
  const items = req.body.items.map((item) => ({ menu_item_id: Number(item.menu_item_id), quantity: Number(item.quantity) }));
  const order = await createOrder({ hotel: req.hotel, user: req.user, items, paymentMethod: req.body.payment_method });
  single(res, order, 201);
}));

/** @openapi
 * /api/hotels/{hotelId}/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders for a hotel
 *     security: [{ bearerAuth: [] }]
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
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, completed, cancelled] }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date, description: IST calendar day }
 *     responses:
 *       200: { description: Paginated hotel orders }
 *       403: { description: Hotel administrator access required }
 */
router.get('/:hotelId/orders', [
  authenticate, positiveId('hotelId'), rejectUnknownQuery(['page', 'limit', 'status', 'date']),
  ...paginationRules(), query('status').optional().isIn(['pending', 'completed', 'cancelled']),
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).bail().custom((value) => { try { istDateToUtc(value); return true; } catch { return false; } }), validate,
  resolveHotel, requireOrderableHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req);
  const status = req.query.status || null;
  const date = req.query.date ? istDateToUtc(req.query.date) : null;
  const end = req.query.date ? istDateToUtc(shiftDate(req.query.date, 1)) : null;
  const where = `hotel_id = ? AND (? IS NULL OR
    (? = 'cancelled' AND cancelled_at IS NOT NULL) OR
    (? = 'completed' AND status = 'completed' AND cancelled_at IS NULL) OR
    (? = 'pending' AND status = 'pending' AND cancelled_at IS NULL))
    AND (? IS NULL OR (created_at >= ? AND created_at < ?))`;
  const args = [req.hotel.id, status, status, status, status, date, date, end];
  const [countRows] = await dbQuery(`SELECT COUNT(*) AS total FROM orders WHERE ${where}`, args);
  const [rows] = await dbQuery(
    `SELECT id, hotel_id, user_id, customer_name, phone, payment_method, total_amount, status, cancelled_at, created_at
     FROM orders WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...args, limit, offset],
  );
  const orderIds = rows.map((row) => row.id);
  let itemRows = [];
  if (orderIds.length) {
    [itemRows] = await dbQuery(
      `SELECT order_id, item_name, quantity FROM order_items
       WHERE hotel_id = ? AND order_id IN (${orderIds.map(() => '?').join(', ')}) ORDER BY id`, [req.hotel.id, ...orderIds],
    );
  }
  const summary = new Map();
  for (const item of itemRows) {
    const current = summary.get(item.order_id) || [];
    current.push(`${item.item_name} x${item.quantity}`);
    summary.set(item.order_id, current);
  }
  const data = rows.map((row) => {
    const summaryText = (summary.get(row.id) || []).join(', ');
    return { ...row, status: row.cancelled_at ? 'cancelled' : row.status,
      item_count: itemRows.filter((item) => Number(item.order_id) === Number(row.id)).length,
      items_summary: summaryText.length > 255 ? `${summaryText.slice(0, 252)}...` : summaryText };
  });
  collection(res, data, { page, limit, total: Number(countRows[0].total) });
}));

/** @openapi
 * /api/hotels/{hotelId}/orders/{orderId}:
 *   get:
 *     tags: [Orders]
 *     summary: Get a hotel order
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: hotelId, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Order and item details }
 *       403: { description: Hotel administrator access required }
 *       404: { description: Order not found }
 */
router.get('/:hotelId/orders/:orderId', [authenticate, positiveId('hotelId'), positiveId('orderId'), rejectUnknownQuery([]), validate, resolveHotel, requireOrderableHotel, requireHotelAdmin], asyncHandler(async (req, res) => {
  const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ? AND hotel_id = ? LIMIT 1', [req.params.orderId, req.hotel.id]);
  if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const [items] = await dbQuery('SELECT menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? AND hotel_id = ? ORDER BY id', [req.params.orderId, req.hotel.id]);
  single(res, { ...rows[0], status: rows[0].cancelled_at ? 'cancelled' : rows[0].status, items });
}));

/** @openapi
 * /api/hotels/{hotelId}/orders/{orderId}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: Complete a pending hotel order
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: hotelId, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [completed] }
 *     responses:
 *       200: { description: Order completed }
 *       403: { description: Hotel administrator access required }
 *       404: { description: Order not found }
 *       409: { description: Order is not pending }
 */
router.patch('/:hotelId/orders/:orderId/status', [authenticate, positiveId('hotelId'), positiveId('orderId'), rejectUnknownQuery([]), rejectUnknownBody(['status']), body('status').equals('completed'), validate, resolveHotel, requireOrderableHotel, requireHotelAdmin], asyncHandler(async (req, res) => {
  await updateOrderState({ hotelId: req.hotel.id, orderId: req.params.orderId, nextState: 'completed' });
  const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ? AND hotel_id = ? LIMIT 1', [req.params.orderId, req.hotel.id]);
  const [items] = await dbQuery('SELECT menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? AND hotel_id = ? ORDER BY id', [req.params.orderId, req.hotel.id]);
  single(res, { ...rows[0], items });
}));

/** @openapi
 * /api/hotels/{hotelId}/orders/{orderId}/cancel:
 *   patch:
 *     tags: [Orders]
 *     summary: Cancel a pending hotel order
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: hotelId, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: path, name: orderId, required: true, schema: { type: integer, minimum: 1 } }
 *     responses:
 *       200: { description: Order cancelled }
 *       403: { description: Hotel administrator access required }
 *       404: { description: Order not found }
 *       409: { description: Cancellation is not allowed }
 */
router.patch('/:hotelId/orders/:orderId/cancel', [authenticate, positiveId('hotelId'), positiveId('orderId'), rejectUnknownQuery([]), rejectUnknownBody([]), validate, resolveHotel, requireOrderableHotel, requireHotelAdmin], asyncHandler(async (req, res) => {
  await updateOrderState({ hotelId: req.hotel.id, orderId: req.params.orderId, nextState: 'cancelled' });
  const [rows] = await dbQuery('SELECT * FROM orders WHERE id = ? AND hotel_id = ? LIMIT 1', [req.params.orderId, req.hotel.id]);
  single(res, { ...rows[0], status: 'cancelled' });
}));

module.exports = router;
