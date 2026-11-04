'use strict';

const { Router } = require('express');
const { query } = require('express-validator');
const { query: dbQuery } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { resolveHotel, requireHotelAdmin } = require('../middleware/tenant');
const { asyncHandler, single, httpError } = require('../utils/http');
const { positiveId, rejectUnknownQuery, validate } = require('./routeUtils');
const { istDateToUtc, istToday, shiftDate } = require('../utils/time');

const router = Router();
const dateRule = (field) => query(field).optional().matches(/^\d{4}-\d{2}-\d{2}$/)
  .bail().custom((value) => { try { istDateToUtc(value); return true; } catch { return false; } });
const dayStart = (value) => istDateToUtc(value);

/** @openapi
 * /api/hotels/{hotelId}/reports/daily-sales:
 *   get:
 *     tags: [Reports]
 *     summary: Get completed sales for a hotel on an IST calendar date
 *     parameters:
 *       - { in: path, name: hotelId, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: date, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Completed order count and total sales }
 *       403: { description: Hotel administrator access required }
 *       404: { description: Hotel not found }
 */
router.get('/:hotelId/reports/daily-sales', [
  authenticate, positiveId('hotelId'), rejectUnknownQuery(['date']), dateRule('date'), validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const date = req.query.date || istToday();
  let start;
  try { start = dayStart(date); } catch { throw httpError(400, 'VALIDATION_ERROR', 'date must be a valid YYYY-MM-DD date.'); }
  const end = dayStart(shiftDate(date, 1));
  const [rows] = await dbQuery(
    `SELECT COUNT(DISTINCT o.id) AS completed_order_count,
            COALESCE(SUM(oi.subtotal), 0) AS total_sales
     FROM orders o JOIN order_items oi ON oi.order_id = o.id AND oi.hotel_id = o.hotel_id
     WHERE o.hotel_id = ? AND oi.hotel_id = ? AND o.status = 'completed' AND o.cancelled_at IS NULL
       AND o.created_at >= ? AND o.created_at < ?`, [req.hotel.id, req.hotel.id, start, end],
  );
  single(res, { date, completed_order_count: Number(rows[0].completed_order_count), total_sales: rows[0].total_sales });
}));

/** @openapi
 * /api/hotels/{hotelId}/reports/top-selling-items:
 *   get:
 *     tags: [Reports]
 *     summary: List top-selling menu items over an inclusive IST date range
 *     parameters:
 *       - { in: path, name: hotelId, required: true, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 50, default: 10 } }
 *     responses:
 *       200: { description: Top-selling items and quantities }
 *       400: { description: Invalid date range }
 *       403: { description: Hotel administrator access required }
 */
router.get('/:hotelId/reports/top-selling-items', [
  authenticate, positiveId('hotelId'), rejectUnknownQuery(['from', 'to', 'limit']), dateRule('from'), dateRule('to'),
  query('limit').optional().matches(/^[1-9]\d*$/).bail().custom((value) => Number(value) <= 50),
  validate, resolveHotel, requireHotelAdmin,
], asyncHandler(async (req, res) => {
  const to = req.query.to || istToday();
  const from = req.query.from || shiftDate(to, -29);
  const start = dayStart(from);
  const end = dayStart(shiftDate(to, 1));
  if (start >= end) throw httpError(400, 'VALIDATION_ERROR', 'from must be on or before to.');
  const limit = Number(req.query.limit || 10);
  const [rows] = await dbQuery(
    `SELECT oi.menu_item_id, oi.item_name, SUM(oi.quantity) AS quantity_sold
     FROM orders o JOIN order_items oi ON oi.order_id = o.id AND oi.hotel_id = o.hotel_id
     WHERE o.hotel_id = ? AND oi.hotel_id = ? AND o.status = 'completed' AND o.cancelled_at IS NULL
       AND o.created_at >= ? AND o.created_at < ?
     GROUP BY oi.menu_item_id, oi.item_name
     ORDER BY quantity_sold DESC, oi.item_name LIMIT ?`, [req.hotel.id, req.hotel.id, start, end, limit],
  );
  single(res, rows.map((row) => ({ ...row, quantity_sold: Number(row.quantity_sold) })));
}));

module.exports = router;
