#!/bin/sh

set -e

cd /bookshop-server
# Hold the lock for the whole run so slow API requests cannot overlap jobs.
exec flock -n /tmp/bookshop-maintenance.lock \
  /bin/sh /bookshop-server/docker/cron/jobs/run_with_cronitor.sh \
  "maintenance" \
  timeout -s TERM -k 10 540 bun run cron:maintenance
