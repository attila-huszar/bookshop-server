#!/bin/sh

set -e

case "${DB_REPO:-}" in
  MONGO) CRON_FILE=/bookshop-server/docker/cron/mongo.crontab ;;
  SQLITE) CRON_FILE=/bookshop-server/docker/cron/sqlite.crontab ;;
  *)
    echo "Invalid DB_REPO: expected SQLITE or MONGO" >&2
    exit 1
    ;;
esac

CRONTAB_DIR="${CRONTAB_DIR:-/tmp/crontabs}"
CRON_USER="$(id -un)"

mkdir -p "$CRONTAB_DIR"
cp "$CRON_FILE" "$CRONTAB_DIR/$CRON_USER"
chown root:root "$CRONTAB_DIR/$CRON_USER"
chmod 600 "$CRONTAB_DIR/$CRON_USER"

echo "Using cron schedule from $CRON_FILE"
# Suppress routine daemon messages while preserving errors and job output.
exec crond -f -l 9 -L /dev/stdout -c "$CRONTAB_DIR"
