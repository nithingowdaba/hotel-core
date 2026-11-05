'use strict';

// Backward-compatible alias; use the guarded, idempotent implementation.
const { seedDatabase } = require('./seed-db');

if (require.main === module) {
  seedDatabase().catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { seedDatabase };
