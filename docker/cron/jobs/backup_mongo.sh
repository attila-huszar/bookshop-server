#!/bin/sh

set -e

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "${CRONITOR_MONGO_BACKUP_MONITOR:-bookshop-mongo-backup}" \
  bun run backup:mongo
