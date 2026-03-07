#!/bin/sh

set -e

MONITOR_KEY="$1"
shift

if [ -n "$CRONITOR_API_KEY" ]; then
  exec cronitor exec --env "${NODE_ENV:-production}" "$MONITOR_KEY" "$@"
fi

exec "$@"
