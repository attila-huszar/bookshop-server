#!/bin/sh

set -e

MONITOR_KEY="$1"
shift

if [ -n "$CRONITOR_API_KEY" ]; then
  exec cronitor --env "${CRONITOR_ENV:-production}" exec "$MONITOR_KEY" "$@"
fi

exec "$@"
