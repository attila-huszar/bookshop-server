#!/bin/sh

set -e

# Initialization is explicit and happens before watch mode, not on each reload.
if [ "${SETUP:-}" = "true" ]; then
  if [ "${DB_REPO:-SQLITE}" = "SQLITE" ]; then
    bun run migrate
  fi

  bun run seed
fi

exec "$@"
