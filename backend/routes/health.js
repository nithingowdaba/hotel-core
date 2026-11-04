'use strict';

const { Router } = require('express');
const { checkConnection } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness check
 *     description: Returns 200 if the server process is running.
 *     security: []
 *     responses:
 *       200:
 *         description: Server is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
router.get('/', (req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness check
 *     description: Returns 200 if the server is ready to serve traffic (DB connected).
 *     security: []
 *     responses:
 *       200:
 *         description: Server is ready
 *       503:
 *         description: Server is not ready (DB unreachable)
 */
router.get('/ready', async (req, res) => {
  const dbOk = await checkConnection();
  if (dbOk) {
    sendSuccess(res, {
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
    sendError(res, 503, 'NOT_READY', 'Database is not reachable.', []);
  }
});

module.exports = router;
