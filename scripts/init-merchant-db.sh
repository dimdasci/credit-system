#!/usr/bin/env bash

# Initialize a merchant database by applying core schema files.
#
# Usage:
#   ./scripts/init-merchant-db.sh <postgres_url>
#   DATABASE_URL=<postgres_url> ./scripts/init-merchant-db.sh
#
# The script applies (idempotently) all SQL files from scripts/sql in numeric order.

set -euo pipefail

print_usage() {
  cat <<'USAGE'
Initialize a merchant database schema.

Usage:
  init-merchant-db.sh <postgres_url>
  DATABASE_URL=<postgres_url> init-merchant-db.sh

Environment:
  DATABASE_URL   Optional alternative to positional argument.

Notes:
  - Requires `psql` to be installed and reachable on PATH.
  - SQL files are applied with `-v ON_ERROR_STOP=1` so the script exits on first error.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is not installed or not on PATH." >&2
  exit 1
fi

# Support leading `--` (e.g., from `pnpm db:init -- <url>`)
if [[ "${1:-}" == "--" ]]; then
  shift
fi

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "Error: Postgres URL must be provided as an argument or DATABASE_URL env var." >&2
  echo >&2
  print_usage >&2
  exit 2
fi

# Resolve repo root relative to this script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Applying schema to database: ${DB_URL}"

# New structured SQL directory
SQL_DIR="${ROOT_DIR}/scripts/sql"
if [[ ! -d "${SQL_DIR}" ]]; then
  echo "Error: SQL directory not found at ${SQL_DIR}" >&2
  exit 5
fi

echo "- Applying SQL files in order from ${SQL_DIR}"
for sql in "${SQL_DIR}"/*.sql; do
  echo "  -> $(basename "$sql")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$sql"
done

echo "Database initialization completed successfully."
