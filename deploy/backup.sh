#!/bin/sh
# Daily PostgreSQL + media backups with rotation. Runs inside the `backup`
# service (postgres image). Restore instructions: docs/development/deployment.md
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p /backups

while true; do
  stamp=$(date +%Y-%m-%d_%H%M)
  echo "[backup] $stamp: dumping database $POSTGRES_DB"
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner -f "/backups/db_$stamp.dump.tmp"; then
    mv "/backups/db_$stamp.dump.tmp" "/backups/db_$stamp.dump"
  else
    echo "[backup] pg_dump failed" >&2
    rm -f "/backups/db_$stamp.dump.tmp"
  fi

  echo "[backup] $stamp: archiving media"
  tar -czf "/backups/media_$stamp.tar.gz" -C /media . || echo "[backup] media archive failed" >&2

  find /backups -type f \( -name 'db_*.dump' -o -name 'media_*.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete
  echo "[backup] done; next run in ${INTERVAL}s"
  sleep "$INTERVAL"
done
