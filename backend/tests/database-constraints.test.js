'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { query, withTransaction } = require('../config/db');

describe('Database Schema & Constraints Verification', () => {
  let customerId;
  let udupiHotelId = 1;
  let divumHotelId = 2;
  let udupiMenuItemId;
  let divumMenuItemId;
  let testOrderId;

  before(async () => {
    // Retrieve seeded reference IDs
    const [users] = await query("SELECT id FROM users WHERE email = 'customer@example.com' LIMIT 1");
    assert.ok(users.length > 0, 'Seed customer must exist');
    customerId = users[0].id;

    const [udupiItems] = await query("SELECT id FROM menu_items WHERE hotel_id = ? LIMIT 1", [udupiHotelId]);
    assert.ok(udupiItems.length > 0, 'Udupi menu items must exist');
    udupiMenuItemId = udupiItems[0].id;

    const [divumItems] = await query("SELECT id FROM menu_items WHERE hotel_id = ? LIMIT 1", [divumHotelId]);
    assert.ok(divumItems.length > 0, 'Divum menu items must exist');
    divumMenuItemId = divumItems[0].id;

    // Create a test order for Udupi Hotel (hotel_id = 1)
    const [orderResult] = await query(
      `INSERT INTO orders (hotel_id, user_id, customer_name, phone, total_amount, status)
       VALUES (?, ?, 'Test Customer', '+919876500000', 8000, 'pending')`,
      [udupiHotelId, customerId]
    );
    testOrderId = orderResult.insertId;
  });

  after(async () => {
    // Clean up test order
    if (testOrderId) {
      await query('DELETE FROM orders WHERE id = ?', [testOrderId]);
    }
  });

  it('verifies all 6 required tables exist in hotel_core', async () => {
    const [tables] = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`
    );
    const tableNames = tables.map((t) => t.TABLE_NAME || t.table_name);
    const expected = ['hotel_members', 'hotels', 'menu_items', 'order_items', 'orders', 'users'];

    for (const expectedTable of expected) {
      assert.ok(tableNames.includes(expectedTable), `Table ${expectedTable} must exist`);
    }
  });

  it('enforces composite foreign key between orders and order_items (mismatched hotel_id must fail)', async () => {
    // testOrderId belongs to Udupi Hotel (hotel_id = 1)
    // Attempting to insert an order_item pointing to testOrderId but with hotel_id = 2 (Divum) must be rejected
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, 'Cross Tenant Attack Item', 8000, 1, 8000)`,
          [testOrderId, divumHotelId, divumMenuItemId]
        );
      },
      (err) => {
        assert.ok(
          err.code === 'ER_NO_REFERENCED_ROW_2' || err.message.includes('foreign key constraint fails'),
          `Expected foreign key violation, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('enforces composite foreign key between menu_items and order_items (menu item from other hotel must fail)', async () => {
    // testOrderId belongs to Udupi Hotel (hotel_id = 1)
    // Attempting to insert an order_item pointing to Divum menu item into Udupi order must be rejected
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, 'Cross Tenant Menu Item', 18000, 1, 18000)`,
          [testOrderId, udupiHotelId, divumMenuItemId] // divumMenuItemId does not belong to udupiHotelId!
        );
      },
      (err) => {
        assert.ok(
          err.code === 'ER_NO_REFERENCED_ROW_2' || err.message.includes('foreign key constraint fails'),
          `Expected foreign key violation, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('allows order_item insertion when order_id, menu_item_id, and hotel_id correctly match', async () => {
    const [result] = await query(
      `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
       VALUES (?, ?, ?, 'Valid Udupi Item', 8000, 1, 8000)`,
      [testOrderId, udupiHotelId, udupiMenuItemId]
    );
    assert.ok(result.insertId > 0);

    // Clean up
    await query('DELETE FROM order_items WHERE id = ?', [result.insertId]);
  });

  it('prevents duplicate menu items within the same hotel and category', async () => {
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO menu_items (hotel_id, name, description, category, price, is_available)
           VALUES (?, 'Masala Dosa', 'Duplicate Dosa', 'South Indian', 8500, TRUE)`,
          [udupiHotelId]
        );
      },
      (err) => {
        assert.equal(err.code, 'ER_DUP_ENTRY');
        return true;
      }
    );
  });

  it('allows same menu item name across different categories or hotels', async () => {
    // Same name in different category within same hotel
    const [resDiffCategory] = await query(
      `INSERT INTO menu_items (hotel_id, name, description, category, price, is_available)
       VALUES (?, 'Masala Dosa', 'Evening special', 'Snacks', 7000, TRUE)`,
      [udupiHotelId]
    );
    assert.ok(resDiffCategory.insertId > 0);

    // Same name in different hotel
    const [resDiffHotel] = await query(
      `INSERT INTO menu_items (hotel_id, name, description, category, price, is_available)
       VALUES (?, 'Masala Dosa', 'Corporate version', 'South Indian', 9500, TRUE)`,
      [divumHotelId]
    );
    assert.ok(resDiffHotel.insertId > 0);

    // Clean up
    await query('DELETE FROM menu_items WHERE id IN (?, ?)', [resDiffCategory.insertId, resDiffHotel.insertId]);
  });

  it('enforces CHECK constraint on menu_items.price (negative price rejected)', async () => {
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO menu_items (hotel_id, name, description, category, price, is_available)
           VALUES (?, 'Negative Price Item', 'Test', 'Beverages', -500, TRUE)`,
          [udupiHotelId]
        );
      },
      (err) => {
        assert.ok(
          err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.message.includes('check constraint') || err.message.includes('Out of range'),
          `Expected check or range constraint error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('enforces CHECK constraint on order_items.quantity (quantity 0 rejected)', async () => {
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, item_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, 'Zero Qty Item', 8000, 0, 0)`,
          [testOrderId, udupiHotelId, udupiMenuItemId]
        );
      },
      (err) => {
        assert.ok(
          err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.message.includes('check constraint'),
          `Expected check constraint error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('enforces CHECK constraint on orders.total_amount (negative total rejected)', async () => {
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO orders (hotel_id, user_id, customer_name, phone, total_amount, status)
           VALUES (?, ?, 'Negative Total Customer', '+919876500000', -100, 'pending')`,
          [udupiHotelId, customerId]
        );
      },
      (err) => {
        assert.ok(
          err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.message.includes('check constraint') || err.message.includes('Out of range'),
          `Expected check constraint error, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it('confirms no platform admin exists in seed data', async () => {
    const [admins] = await query("SELECT id, email, role FROM users WHERE role = 'PLATFORM_ADMIN'");
    assert.equal(admins.length, 0, 'Platform admin must NEVER be created in seed data');
  });
});
