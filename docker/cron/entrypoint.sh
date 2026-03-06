#!/bin/sh

set -e

if [ ! -f "${CRON_FILE:-}" ]; then
  echo "CRON_FILE is empty or file does not exist"
  exit 1
fi

cp "$CRON_FILE" /etc/crontabs/root

echo "Using cron schedule from $CRON_FILE"
exec crond -f -l 8
