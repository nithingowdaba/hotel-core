#!/usr/bin/env bash
# =============================================================================
# Database initialization & seeding script for hotel_core
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="${DB_NAME:-hotel_core}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-secret}"
DB_SOCKET="${DB_SOCKET_PATH:-/tmp/mysql-run/mysqld.sock}"

MYSQL_CMD="mysql -u${DB_USER} -p${DB_PASSWORD}"

if [ -S "${DB_SOCKET}" ]; then
  MYSQL_CMD="${MYSQL_CMD} --socket=${DB_SOCKET}"
else
  MYSQL_CMD="${MYSQL_CMD} -h${DB_HOST:-127.0.0.1} -P${DB_PORT:-3306}"
fi

echo "==> Initializing schema from ${SCRIPT_DIR}/schema.sql ..."
${MYSQL_CMD} < "${SCRIPT_DIR}/schema.sql"

echo "==> Applying seed data from ${SCRIPT_DIR}/seed.sql ..."
${MYSQL_CMD} "${DB_NAME}" < "${SCRIPT_DIR}/seed.sql"

echo "==> Database '${DB_NAME}' initialized and seeded successfully."
