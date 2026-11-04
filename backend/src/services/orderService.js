'use strict';

const { query, withTransaction } = require('../config/db');
const { rupeesToPaise, paiseToRupees } = require('../../utils/money');
const { httpError } = require('../utils/http');

function money(value) {
  return paiseToRupees(rupeesToPaise(String(value)));
}

async function createOrder({ hotel, user, items, paymentMethod }) {
  if (hotel.status !== 'active') throw httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.');
  if (!hotel.accepting_orders) throw httpError(409, 'HOTEL_CLOSED', 'This hotel is not accepting orders.');
  const quantities = new Map();
  for (const item of items) quantities.set(item.menu_item_id, (quantities.get(item.menu_item_id) || 0) + item.quantity);
  for (const quantity of quantities.values()) {
    if (quantity > 999) throw httpError(400, 'VALIDATION_ERROR', 'Combined item quantity must not exceed 999.');
  }
  const ids = [...quantities.keys()];
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT id, name, price, is_available FROM menu_items
       WHERE hotel_id = ? AND id IN (${ids.map(() => '?').join(', ')})`, [hotel.id, ...ids],
    );
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw httpError(400, 'INVALID_MENU_ITEM', 'One or more menu items are invalid.', missing.map((id) => ({ menu_item_id: id })));
    const unavailable = ids.filter((id) => !byId.get(id).is_available);
    if (unavailable.length) throw httpError(409, 'ITEM_UNAVAILABLE', 'One or more menu items are unavailable.', unavailable.map((id) => ({ menu_item_id: id })));

    const orderItems = ids.map((id) => {
      const row = byId.get(id);
      const unitPaise = rupeesToPaise(String(row.price));
      const quantity = quantities.get(id);
      return { menu_item_id: id, item_name: row.name, unit_price: paiseToRupees(unitPaise), quantity,
        subtotal: paiseToRupees(unitPaise * quantity), subtotalPaise: unitPaise * quantity };
    });
    const totalPaise = orderItems.reduce((sum, item) => sum + item.subtotalPaise, 0);
    if (totalPaise > 9999999999) throw httpError(400, 'VALIDATION_ERROR', 'Order total is too large.');
    const [insert] = await connection.execute(
      `INSERT INTO orders (hotel_id, user_id, customer_name, phone, payment_method, total_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hotel.id, user.id, user.full_name, user.phone, paymentMethod, paiseToRupees(totalPaise)],
    );
    const values = [];
    const valueSets = orderItems.map((item) => {
      values.push(insert.insertId, hotel.id, item.menu_item_id, item.item_name, item.unit_price, item.quantity, item.subtotal);
      return '(?, ?, ?, ?, ?, ?, ?)';
    });
    await connection.execute(
      `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
       VALUES ${valueSets.join(', ')}`, values,
    );
    return {
      id: Number(insert.insertId), hotel_id: Number(hotel.id), user_id: Number(user.id),
      customer_name: user.full_name, phone: user.phone, payment_method: paymentMethod,
      total_amount: paiseToRupees(totalPaise), status: 'pending', cancelled_at: null,
      created_at: new Date().toISOString(), items: orderItems.map(({ subtotalPaise, ...item }) => item),
    };
  });
}

async function updateOrderState({ orderId, hotelId, userId, nextState }) {
  const ownerColumn = userId ? 'user_id' : 'hotel_id';
  const owner = userId || hotelId;
  const [result] = await query(
    nextState === 'cancelled'
      ? `UPDATE orders SET cancelled_at = CURRENT_TIMESTAMP
         WHERE id = ? AND ${ownerColumn} = ? AND status = 'pending' AND cancelled_at IS NULL`
      : `UPDATE orders SET status = 'completed'
         WHERE id = ? AND ${ownerColumn} = ? AND status = 'pending' AND cancelled_at IS NULL`,
    [orderId, owner],
  );
  if (result.affectedRows) return true;
  const [rows] = await query(`SELECT id, status, cancelled_at FROM orders WHERE id = ? AND ${ownerColumn} = ? LIMIT 1`, [orderId, owner]);
  if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (nextState === 'cancelled') throw httpError(409, 'CANCELLATION_NOT_ALLOWED', 'Only pending orders can be cancelled.');
  throw httpError(409, 'INVALID_STATUS_TRANSITION', 'Only pending orders can be completed.');
}

module.exports = { createOrder, updateOrderState, money };
