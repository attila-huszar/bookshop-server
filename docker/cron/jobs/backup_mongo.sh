#!/bin/sh

set -e

export DB_REPO=MONGO

cd /bookshop-server
exec flock -n /tmp/bookshop-mongo-backup.lock \
  /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "mongo-backup" \
  timeout -s TERM -k 30 3600 bun src/scripts/backup.ts
