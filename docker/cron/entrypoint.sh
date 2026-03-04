#!/bin/sh

set -e

if [ ! -f "${CRON_FILE:-}" ]; then
  echo "CRON_FILE is empty or file does not exist"
  exit 1
fi

if [ -n "$CRONITOR_API_KEY" ]; then
  cronitor configure --api-key "$CRONITOR_API_KEY"
fi

cp "$CRON_FILE" /etc/crontabs/root

echo "Using cron schedule from $CRON_FILE"
crond -f -l 8
