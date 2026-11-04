'use strict';

const env = require('./config/env');
const app = require('./app');

const server = app.listen(env.port, () => {
  console.log(`[server] hotel-core backend running on port ${env.port} (${env.nodeEnv})`);
  console.log(`[server] Swagger UI → http://localhost:${env.port}/api-docs`);
  console.log(`[server] Health    → http://localhost:${env.port}/health`);
  console.log(`[server] Readiness → http://localhost:${env.port}/health/ready`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully…`);
  server.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });
  // Force exit if shutdown takes too long
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled Promise Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
  process.exit(1);
});

module.exports = server;
