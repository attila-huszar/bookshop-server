#!/bin/sh

set -e

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <monitor-key> <command> [args...]" >&2
  exit 2
fi

MONITOR_KEY="$1"
shift

if [ -n "${CRONITOR_API_KEY:-}" ] && command -v cronitor >/dev/null 2>&1; then
  exec cronitor exec --env "${NODE_ENV:-production}" "$MONITOR_KEY" "$@"
fi

if [ -n "${CRONITOR_API_KEY:-}" ] && ! command -v cronitor >/dev/null 2>&1; then
  echo "cronitor CLI not found; running without monitoring" >&2
fi

exec "$@"
