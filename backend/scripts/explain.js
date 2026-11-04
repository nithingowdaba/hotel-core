'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

const database = process.env.DB_NAME || '';
if (!/^[A-Za-z0-9_]+_test$/.test(database)) {
  throw new Error('EXPLAIN fixture refused to run: DB_NAME must be a safe identifier ending in _test.');
}

function options() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    port: Number(process.env.DB_PORT || 3306),
    timezone: '+00:00',
  };
  if (process.env.DB_SOCKET_PATH) config.socketPath = process.env.DB_SOCKET_PATH;
  else config.host = process.env.DB_HOST;
  return config;
}

async function main() {
  const connection = await mysql.createConnection(options());
  let userId;
  let hotelA;
  let hotelB;
  try {
    const nonce = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const [user] = await connection.execute(
      'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      ['EXPLAIN Fixture', `explain_${nonce}@example.test`, '9000000000', 'not-a-login-hash'],
    );
    userId = user.insertId;
    const [hotels] = await connection.query(
      `INSERT INTO hotels (name, slug) VALUES (?, ?), (?, ?)`,
      [`EXPLAIN A ${nonce}`, `explain-a-${nonce}`, `EXPLAIN B ${nonce}`, `explain-b-${nonce}`],
    );
    hotelA = hotels.insertId;
    hotelB = hotelA + 1;
    const [menu] = await connection.query(
      `INSERT INTO menu_items (hotel_id, name, category, price) VALUES (?, 'Item A', 'Test', 10.00), (?, 'Item B', 'Test', 20.00)`,
      [hotelA, hotelB],
    );
    const firstMenu = menu.insertId;
    const orderIds = [];
    for (const hotelId of [hotelA, hotelB]) {
      for (let offset = 0; offset < 2500; offset += 250) {
        const orderValues = [];
        const sets = [];
        for (let i = 0; i < 250; i += 1) {
          const completed = (offset + i) % 2 === 0;
          sets.push('(?, ?, ?, ?, ?, ?, ?)');
          orderValues.push(hotelId, userId, 'EXPLAIN Fixture', '9000000000', 'cash', completed ? '30.00' : '10.00', completed ? 'completed' : 'pending');
        }
        const [insert] = await connection.execute(
          `INSERT INTO orders (hotel_id, user_id, customer_name, phone, payment_method, total_amount, status) VALUES ${sets.join(', ')}`,
          orderValues,
        );
        orderIds.push({ hotelId, first: insert.insertId, last: insert.insertId + 249 });
        const itemValues = [];
        const itemSets = [];
        for (let i = 0; i < 250; i += 1) {
          const orderId = insert.insertId + i;
          const itemId = hotelId === hotelA ? firstMenu : firstMenu + 1;
          for (let line = 0; line < 2; line += 1) {
            itemSets.push('(?, ?, ?, ?, ?, ?, ?)');
            itemValues.push(orderId, hotelId, itemId, `Item ${line + 1}`, line ? '20.00' : '10.00', 1, line ? '20.00' : '10.00');
          }
        }
        await connection.execute(
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal) VALUES ${itemSets.join(', ')}`,
          itemValues,
        );
      }
    }
    const plans = [
      ['hotel_pending_orders', 'SELECT id FROM orders WHERE hotel_id = ? AND status = ? AND cancelled_at IS NULL ORDER BY created_at DESC LIMIT 20', [hotelA, 'pending']],
      ['customer_order_history', 'SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]],
      ['daily_sales', `SELECT COUNT(DISTINCT o.id), COALESCE(SUM(oi.subtotal), 0) FROM orders o JOIN order_items oi ON oi.order_id = o.id AND oi.hotel_id = o.hotel_id WHERE o.hotel_id = ? AND oi.hotel_id = ? AND o.status = 'completed' AND o.cancelled_at IS NULL AND o.created_at >= ? AND o.created_at < ?`, [hotelA, hotelA, new Date(Date.now() - 86_400_000), new Date()]],
      ['top_selling_items', `SELECT oi.menu_item_id, SUM(oi.quantity) FROM orders o JOIN order_items oi ON oi.order_id = o.id AND oi.hotel_id = o.hotel_id WHERE o.hotel_id = ? AND oi.hotel_id = ? AND o.status = 'completed' AND o.cancelled_at IS NULL AND o.created_at >= ? AND o.created_at < ? GROUP BY oi.menu_item_id`, [hotelA, hotelA, new Date(Date.now() - 30 * 86_400_000), new Date()]],
    ];
    for (const [name, sql, values] of plans) {
      const [rows] = await connection.execute(`EXPLAIN ${sql}`, values);
      console.log(`\n${name}`);
      console.log(JSON.stringify(rows, null, 2));
    }
  } finally {
    if (hotelA && userId) {
      await connection.execute('DELETE FROM orders WHERE user_id = ? AND hotel_id IN (?, ?)', [userId, hotelA, hotelB]);
      await connection.execute('DELETE FROM menu_items WHERE hotel_id IN (?, ?)', [hotelA, hotelB]);
      await connection.execute('DELETE FROM hotels WHERE id IN (?, ?)', [hotelA, hotelB]);
    }
    if (userId) await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`[explain] ${error.message}`);
  process.exitCode = 1;
});
