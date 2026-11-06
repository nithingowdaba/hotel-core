'use strict';

const { query } = require('../config/db');
const { asyncHandler, httpError } = require('../utils/http');

const resolveHotel = asyncHandler(async (req, res, next) => {
  const rawId = req.params.hotelId;
  if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    throw httpError(400, 'INVALID_HOTEL_ID', 'hotelId must be a positive integer.');
  }

  const [rows] = await query(
    `SELECT id, name, slug, status, accepting_orders
     FROM hotels WHERE id = ? LIMIT 1`,
    [rawId],
  );
  if (!rows.length) throw httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.');

  const hotel = rows[0];
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (hotel.status === 'suspended') {
    if (isWrite) throw httpError(403, 'HOTEL_SUSPENDED', 'This hotel is suspended.');
    if (req.user?.role !== 'PLATFORM_ADMIN') {
      const [members] = req.user
        ? await query('SELECT user_id FROM hotel_members WHERE user_id = ? AND hotel_id = ? LIMIT 1', [req.user.id, hotel.id])
        : [[]];
      if (!members.length) {
        throw httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.');
      }
    }
  }
  req.hotel = hotel;
  next();
});

const requireVisibleHotel = asyncHandler(async (req, res, next) => {
  if (req.hotel?.status === 'active') return next();
  if (req.user && req.hotel) {
    if (req.user.role === 'PLATFORM_ADMIN') return next();
    const [rows] = await query(
      'SELECT user_id FROM hotel_members WHERE user_id = ? AND hotel_id = ? LIMIT 1',
      [req.user.id, req.hotel.id],
    );
    if (rows.length) return next();
  }
  return next(httpError(404, 'HOTEL_NOT_FOUND', 'Hotel not found.'));
});

const requireOrderableHotel = (req, res, next) => {
  if (req.hotel?.status === 'pending') {
    return next(httpError(403, 'HOTEL_PENDING', 'This legacy hotel is not active.'));
  }
  if (req.hotel?.status === 'rejected') {
    return next(httpError(403, 'HOTEL_REJECTED', 'This legacy hotel is not active.'));
  }
  return next();
};

const requireHotelAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user || !req.hotel) throw httpError(403, 'FORBIDDEN', 'You do not have access to this hotel.');
  if (req.user.role === 'PLATFORM_ADMIN') return next();

  const [rows] = await query(
    `SELECT user_id FROM hotel_members WHERE user_id = ? AND hotel_id = ? LIMIT 1`,
    [req.user.id, req.hotel.id],
  );
  if (!rows.length) throw httpError(403, 'FORBIDDEN', 'You do not have access to this hotel.');
  next();
});

module.exports = { resolveHotel, requireHotelAdmin, requireVisibleHotel, requireOrderableHotel };
