'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const swaggerSpec = require('./config/swagger');
const { defaultLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const healthRouter = require('./routes/health');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins =
  env.nodeEnv === 'production'
    ? (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:4173'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(defaultLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
app.use('/health', healthRouter);

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
