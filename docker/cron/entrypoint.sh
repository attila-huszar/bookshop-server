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
export BOOKSHOP_CRON_JOB_DIRECTORY=/tmp/bookshop-cron-jobs
mkdir -p "$BOOKSHOP_CRON_JOB_DIRECTORY"
chown bun:bun "$BOOKSHOP_CRON_JOB_DIRECTORY"
chmod 700 "$BOOKSHOP_CRON_JOB_DIRECTORY"
rm -f "$BOOKSHOP_CRON_JOB_DIRECTORY"/*.pid

shutdown() {
  trap '' TERM INT
  kill -TERM "$CRON_PID" 2>/dev/null || true

  # Stop the scheduler, then let active jobs cancel children/uploads and clean up.
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    active=false
    for pid_file in "$BOOKSHOP_CRON_JOB_DIRECTORY"/*.pid; do
      if [ ! -f "$pid_file" ]; then
        continue
      fi

      read -r job_pid < "$pid_file" || true
      case "$job_pid" in
        ''|*[!0-9]*) continue ;;
      esac

      if kill -0 "$job_pid" 2>/dev/null; then
        active=true
        kill -TERM "$job_pid" 2>/dev/null || true
      fi
    done

    if [ "$active" = false ] && [ "$attempt" -gt 1 ]; then
      break
    fi

    sleep 1
  done

  wait "$CRON_PID" 2>/dev/null || true
  exit 0
}

trap shutdown TERM INT
# Suppress routine daemon messages while preserving errors and job output.
crond -f -l 9 -L /dev/stdout -c "$CRONTAB_DIR" &
CRON_PID=$!
wait "$CRON_PID"
