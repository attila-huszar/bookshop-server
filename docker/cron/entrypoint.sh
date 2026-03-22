#!/bin/sh

set -e

if [ ! -f "${CRON_FILE:-}" ]; then
  echo "CRON_FILE is empty or file does not exist"
  exit 1
fi

CRONTAB_DIR="${CRONTAB_DIR:-/tmp/crontabs}"
CRON_USER="$(id -un)"

mkdir -p "$CRONTAB_DIR"
cp "$CRON_FILE" "$CRONTAB_DIR/$CRON_USER"

echo "Using cron schedule from $CRON_FILE"
exec crond -f -l 8 -c "$CRONTAB_DIR"
