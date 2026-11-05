#!/bin/sh

set -eu

mode="$1"
shift

if [ "$mode" = backup ]; then
  directory="$1"
else
  directory="${BOOKSHOP_DATABASE_COORDINATION_DIR:-}"

  if [ "${DB_REPO:-}" != MONGO ] || [ -z "$directory" ]; then
    exec "$@"
  fi
fi

mkdir -p "$directory"
exec 8>"$directory/pause.lock"
exec 9>"$directory/writers.lock"

if [ "$mode" = backup ]; then
  # Serialize requests before resetting the previous drain outcome.
  exec 7>"$directory/backups.lock"
  flock -x 7 || exit 1
  rm -f "$directory/drain-failed"
  flock -x 8 || exit 1
  flock -x 9 || exit 1

  # A whole-container crash can bypass the supervisor's failure report.
  # With the writer lease exclusive, an unfinished record cannot belong to
  # an application still using the database. Reject this dump and clear it.
  for record in "$directory"/drain.*; do
    case "$record" in
      *.request|*.failed) continue ;;
    esac

    if [ ! -f "$record" ]; then
      continue
    fi

    if [ -f "$record.failed" ] || ! read -r drained <"$record" || [ "$drained" != 0 ]; then
      : >"$directory/drain-failed"
      rm -f "$record" "$record.request" "$record.failed"
    fi
  done

  if [ -f "$directory/drain-failed" ]; then
    echo "A database writer failed to drain cleanly" >&2
    exit 1
  fi

  echo READY
  # Closing the owner's pipe releases every lock, including after a crash.
  cat >/dev/null
  exit 0
fi

if [ "$mode" != service ] && [ "$mode" != job ]; then
  echo "Expected database-access mode: service, job or backup" >&2
  exit 1
fi

# Leave time for the worker's 45-second shutdown before the backup's
# 60-second acquisition deadline. Tests can select a shorter deadline.
drain_timeout="${BOOKSHOP_DATABASE_DRAIN_TIMEOUT_SECONDS:-50}"
case "$drain_timeout" in
  ''|0*|*[!0-9]*)
    echo "BOOKSHOP_DATABASE_DRAIN_TIMEOUT_SECONDS must be a positive integer" >&2
    exit 1
    ;;
esac

supervisor=$$
drain_file=''

cleanup_record() {
  if [ -n "$drain_file" ]; then
    rm -f "$drain_file" "$drain_file.request" "$drain_file.failed"
  fi
}

trap cleanup_record EXIT
child=''
monitor=''
stopping=false
paused=false

stop_child() {
  if [ -n "$child" ]; then
    : >"$drain_file"
    : >"$drain_file.request"
    kill -TERM "-$child" 2>/dev/null || true
  fi
}

trap 'stopping=true; stop_child' TERM INT
trap 'paused=true; stop_child' USR1

while [ "$stopping" = false ]; do
  # Take both startup locks in the same order as the backup. New writers wait
  # outside the database while a backup is requested or running.
  until flock -n -s 8; do
    if [ "$stopping" = true ]; then
      exit 143
    fi

    sleep 0.2
  done

  flock -s 9 || exit 1
  flock -u 8 || exit 1
  paused=false

  if [ -z "$drain_file" ]; then
    drain_file=$(mktemp "$directory/drain.XXXXXX")
  fi

  : >"$drain_file"
  rm -f "$drain_file.request" "$drain_file.failed"

  # The child also inherits the writer lease, protecting a supervisor crash.
  BOOKSHOP_PROCESS_DRAIN_FILE="$drain_file" setsid "$@" 8>&- &
  child=$!

  (
    exec 8>&- 9>&-
    remaining=$((drain_timeout * 5))

    # Keep supervising descendants if the group leader exits first.
    while kill -0 "$child" 2>/dev/null || kill -0 "-$child" 2>/dev/null; do
      if ! kill -0 "$child" 2>/dev/null && [ ! -f "$drain_file.request" ]; then
        : >"$drain_file.request"
      fi

      # --watch can stay alive after the application has drained. Its lifecycle
      # acknowledgement makes terminating the remaining watcher safe.
      if [ -f "$drain_file.request" ] && read -r drained <"$drain_file"; then
        case "$drained" in
          0|1)
            kill -KILL "-$child" 2>/dev/null || true
            exit 0
            ;;
        esac
      fi

      if [ -f "$drain_file.request" ]; then
        if [ "$remaining" -le 0 ]; then
          : >"$drain_file.failed"
          echo "Database writer drain timed out after ${drain_timeout}s" >&2
          kill -KILL "-$child" 2>/dev/null || true
          exit 1
        fi

        remaining=$((remaining - 1))
      fi

      if [ "$mode" = service ] && ! flock -n -s "$directory/pause.lock" true; then
        if [ ! -f "$drain_file.request" ]; then
          kill -USR1 "$supervisor" 2>/dev/null || true
        fi
      fi

      sleep 0.2
    done
  ) &
  monitor=$!

  code=0

  # A trap can interrupt wait before the child finishes draining.
  while :; do
    wait "$child" || code=$?

    if ! kill -0 "$child" 2>/dev/null; then
      break
    fi

    code=0
  done

  # Bun's watch process may exit before its application child finishes cleanup.
  while kill -0 "-$child" 2>/dev/null; do
    if [ -f "$drain_file.failed" ]; then
      : >"$directory/drain-failed"
      exit 1
    fi

    sleep 0.1
  done

  kill "$monitor" 2>/dev/null || true
  wait "$monitor" 2>/dev/null || true
  monitor=''
  child=''

  if read -r drained <"$drain_file"; then
    case "$drained" in
      0|1) code="$drained" ;;
    esac
  fi

  if [ -f "$drain_file.failed" ]; then
    code=1
  fi

  if [ "$code" -ne 0 ] && ! flock -n -s "$directory/pause.lock" true; then
    : >"$directory/drain-failed"
  fi

  # Remove a finished job's record while its writer lease still protects it.
  if [ "$paused" = false ] || [ "$mode" = job ] || [ "$stopping" = true ]; then
    cleanup_record
    drain_file=''
  fi

  flock -u 9 || exit 1

  if [ "$stopping" = true ]; then
    exit "$code"
  fi

  if [ "$paused" = true ] && [ "$mode" = service ] && [ "$code" -eq 0 ]; then
    continue
  fi

  if [ "$paused" = true ]; then
    exit 1
  fi

  exit "$code"
done
