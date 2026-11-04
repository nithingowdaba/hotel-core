'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const spec = require('../config/swagger');

test('Swagger spec documents the Step 3 hotel, menu, and platform routes', () => {
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
  };

  for (const [path, methods] of Object.entries(expected)) {
    assert.ok(spec.paths[path], `missing path ${path}`);
    for (const method of methods) assert.ok(spec.paths[path][method], `missing ${method.toUpperCase()} ${path}`);
  }
  assert.deepEqual(spec.paths['/api/hotels/{hotelId}/menu-items'].post.requestBody.required, true);
  assert.deepEqual(spec.paths['/api/platform/hotels/{hotelId}/admins'].post.requestBody.required, true);
  assert.ok(spec.components.securitySchemes.bearerAuth);
  assert.ok(spec.security.some((requirement) => requirement.bearerAuth));
});
