#!/bin/sh

set -e

cd /bookshop-server
exec /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "cleanup" \
  bun run cron:cleanup
