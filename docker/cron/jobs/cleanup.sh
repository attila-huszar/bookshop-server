#!/bin/sh

set -e

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "${CRONITOR_CLEANUP_MONITOR:-bookshop-cleanup}" \
  bun run cron:cleanup
