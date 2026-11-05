#!/usr/bin/env bash
# Compatibility wrapper around the guarded backend database scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../backend" && pwd)"
cd "${BACKEND_DIR}"

if [[ -n "${DB_NAME:-}" ]]; then
  npm run db:init -- --database "${DB_NAME}"
  npm run db:seed -- --database "${DB_NAME}"
else
  npm run db:init
  npm run db:seed
fi
