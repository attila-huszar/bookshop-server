#!/bin/sh

set -e

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "sqlite-backup" \
  bun run backup:sqlite
