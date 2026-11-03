#!/bin/sh

set -e

export DB_REPO=MONGO

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "mongo-backup" \
  bun src/scripts/backup.ts
