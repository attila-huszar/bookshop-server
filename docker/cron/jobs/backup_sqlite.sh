#!/bin/sh

set -e

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "${CRONITOR_SQLITE_BACKUP_MONITOR:-bookshop-sqlite-backup}" \
  bun run backup:sqlite
