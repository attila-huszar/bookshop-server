#!/bin/sh

set -e

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <monitor-key> <command> [args...]" >&2
  echo "Error: monitor key is required" >&2
  exit 1
fi

MONITOR_KEY="$1"
shift

if [ -z "$MONITOR_KEY" ]; then
  echo "Usage: $0 <monitor-key> <command> [args...]" >&2
  echo "Error: monitor key is required" >&2
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <monitor-key> <command> [args...]" >&2
  echo "Error: command is required" >&2
  exit 1
fi

if [ -n "${CRONITOR_API_KEY:-}" ]; then
  if command -v cronitor >/dev/null 2>&1; then
    exec cronitor exec --env "${NODE_ENV:-production}" "$MONITOR_KEY" "$@"
  fi

  echo "Warning: CRONITOR_API_KEY is set but cronitor CLI not found; running without monitoring" >&2
fi

exec "$@"
