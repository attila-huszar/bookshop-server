#!/bin/sh

set -e

export DB_REPO=SQLITE

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "sqlite-backup" \
  bun src/scripts/backup.ts
