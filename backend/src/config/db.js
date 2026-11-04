'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

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
      timezone: '+00:00',
      dateStrings: false,
    };

    if (env.db.socketPath) {
      config.socketPath = env.db.socketPath;
    } else {
      config.host = env.db.host;
      config.port = env.db.port;
    }

    pool = mysql.createPool(config);
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'", (error) => {
        if (error) connection.destroy();
      });
    });
  }
  return pool;
}

/**
 * Execute a parameterized query against the pool.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<[import('mysql2').RowDataPacket[], import('mysql2').FieldPacket[]]>}
 */
async function query(sql, params = []) {
  const conn = getPool();
  return conn.execute(sql, params);
}

/**
 * Run a function inside a transaction. Rolls back on error.
 * @param {(connection: import('mysql2/promise').Connection) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  await connection.beginTransaction();
  try {
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
 * @returns {Promise<boolean>}
 */
async function checkConnection() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { getPool, query, withTransaction, checkConnection };
