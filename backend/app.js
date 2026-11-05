'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const fs = require('node:fs');
const path = require('node:path');

const env = require('./config/env');
const swaggerSpec = require('./config/swagger');
const { apiLimiter } = require('./src/middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const healthRouter = require('./routes/health');
const routes = require('./src/routes');
const { recordRequest, setRoutePrefix } = require('./src/middleware/metrics');

const app = express();
app.set('trust proxy', 1);
app.use(recordRequest);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'", 'https:', 'data:'],
      'connect-src': ["'self'"],
    },
  },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = env.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
if (allowedOrigins.length) {
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  }));
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(apiLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Hotel Core API Docs',
    swaggerOptions: { persistAuthorization: true },
  }),
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health', setRoutePrefix, healthRouter);
app.use('/api', routes);

// Serve the customer application only after a production frontend build exists.
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders(res, filePath) {
      const relative = path.relative(frontendDist, filePath).split(path.sep).join('/');
      if (relative.startsWith('assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get(/^(?!\/api|\/api-docs|\/health).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found.`,
      details: [],
    },
  });
});

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

module.exports = app;
