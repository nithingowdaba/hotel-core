'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const spec = require('../config/swagger');

test('Swagger spec documents hotel, menu, platform, order, report, and health routes', () => {
  const expected = {
    '/api/hotels': ['get'],
    '/api/hotels/{hotelId}': ['get', 'patch'],
    '/api/hotels/{hotelId}/menu': ['get'],
    '/api/hotels/{hotelId}/menu-items': ['get', 'post'],
    '/api/hotels/{hotelId}/menu-items/{id}': ['get', 'patch'],
    '/api/hotels/{hotelId}/menu-items/{id}/availability': ['patch'],
    '/api/platform/hotels': ['get', 'post'],
    '/api/platform/hotels/{hotelId}': ['patch'],
    '/api/platform/hotels/{hotelId}/admins': ['get', 'post'],
    '/api/platform/hotels/{hotelId}/admins/{userId}': ['delete'],
    '/api/hotels/{hotelId}/orders': ['get', 'post'],
    '/api/hotels/{hotelId}/orders/{orderId}': ['get'],
    '/api/hotels/{hotelId}/orders/{orderId}/status': ['patch'],
    '/api/hotels/{hotelId}/orders/{orderId}/cancel': ['patch'],
    '/api/me/orders': ['get'],
    '/api/me/orders/{orderId}': ['get'],
    '/api/me/orders/{orderId}/cancel': ['patch'],
    '/api/me/profile': ['patch'],
    '/api/me/addresses': ['get', 'post'],
    '/api/me/addresses/{addressId}': ['delete'],
    '/api/hotels/{hotelId}/reports/daily-sales': ['get'],
    '/api/hotels/{hotelId}/reports/top-selling-items': ['get'],
    '/api/platform/metrics': ['get'],
    '/health': ['get'],
    '/health/ready': ['get'],
  };

  for (const [path, methods] of Object.entries(expected)) {
    assert.ok(spec.paths[path], `missing path ${path}`);
    for (const method of methods) assert.ok(spec.paths[path][method], `missing ${method.toUpperCase()} ${path}`);
  }
  assert.deepEqual(spec.paths['/api/hotels/{hotelId}/menu-items'].post.requestBody.required, true);
  assert.deepEqual(spec.paths['/api/platform/hotels/{hotelId}/admins'].post.requestBody.required, true);
  assert.ok(spec.paths['/api/platform/hotels'].get.parameters.some((parameter) => parameter.name === 'search' && parameter.in === 'query'));
  assert.ok(spec.paths['/api/me/orders'].get.parameters.some((parameter) => parameter.name === 'status' && parameter.schema.enum.includes('past')));
  const createOrder = spec.paths['/api/hotels/{hotelId}/orders'].post;
  assert.equal(createOrder.requestBody.content['application/json'].schema.required.includes('items'), true);
  assert.equal(createOrder.security[0].bearerAuth.length, 0);
  assert.ok(spec.components.securitySchemes.bearerAuth);
  assert.ok(spec.security.some((requirement) => requirement.bearerAuth));
});
