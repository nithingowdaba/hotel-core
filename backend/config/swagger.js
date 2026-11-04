'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Hotel Core API',
      version: '1.0.0',
      description:
        'Multi-tenant food ordering platform API for Hotel Core. ' +
        'Serves multiple hotels/vendors on a shared platform.',
      contact: {
        name: 'Divum Corporate Solutions',
      },
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: {} },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        OrderItem: {
          type: 'object',
          properties: {
            menu_item_id: { type: 'integer' }, item_name: { type: 'string' },
            unit_price: { type: 'number', format: 'decimal' }, quantity: { type: 'integer' },
            subtotal: { type: 'number', format: 'decimal' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer' }, hotel_id: { type: 'integer' }, user_id: { type: 'integer' },
            customer_name: { type: 'string' }, phone: { type: 'string' },
            payment_method: { type: 'string', enum: ['cash', 'upi', 'card'] },
            total_amount: { type: 'number', format: 'decimal' },
            status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
            cancelled_at: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Health', description: 'Health and readiness endpoints' },
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Hotels', description: 'Hotel management (platform admin)' },
      { name: 'Menu', description: 'Menu management (hotel admin)' },
      { name: 'Orders', description: 'Order management (customer)' },
      { name: 'Reports', description: 'Hotel sales and item reports' },
      { name: 'Platform', description: 'Platform administration and metrics' },
    ],
  },
  // Resolve from this config file so route annotations are found regardless of
  // the process working directory (including the authentication route module).
  apis: [
    path.resolve(__dirname, '../routes/**/*.js'),
    path.resolve(__dirname, '../routes/*.js'),
    path.resolve(__dirname, '../src/routes/**/*.js'),
    path.resolve(__dirname, '../src/routes/*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
