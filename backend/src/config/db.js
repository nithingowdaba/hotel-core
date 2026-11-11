"use strict";

const mysql = require("mysql2/promise");
const env = require("./env");

let pool;

function getPool() {
  if (!pool) {
    const config = {
      user: env.db.user,
      password: env.db.password,
      database: env.db.name,
      connectionLimit: env.db.poolSize,
      waitForConnections: true,
      queueLimit: 100,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: "+00:00",
      dateStrings: false,
    };

    if (env.db.socketPath) {
      config.socketPath = env.db.socketPath;
    } else {
      config.host = env.db.host;
      config.port = env.db.port;
    }

    pool = mysql.createPool(config);

    pool.on("connection", (connection) => {
      connection.query("SET time_zone = '+00:00'", (error) => {
        if (error) {
          console.error("[db] Timezone setup failed:", error.message);
          connection.destroy();
        }
      });
    });
  }

  return pool;
}

/**
 * Execute a parameterized query against the pool.
 */
async function query(sql, params = []) {
  const conn = getPool();
  return conn.execute(sql, params);
}

/**
 * Run a function inside a transaction.
 */
async function withTransaction(fn) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const result = await fn(connection);

    await connection.commit();

    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Verify the database is reachable.
 */
async function checkConnection() {
  try {
    await query("SELECT 1");
    return true;
  } catch (error) {
    console.error("[db] Readiness check failed:", error.code, error.message);

    return false;
  }
}

module.exports = {
  getPool,
  query,
  withTransaction,
  checkConnection,
};
