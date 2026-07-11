#!/bin/sh
set -eu

: "${DATABASE_SERVER_URL:?DATABASE_SERVER_URL is required, without a database path}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required}"

work_dir="$(mktemp -d)"
database_name="moneymentor_restore_verify_$(date -u +%Y%m%d%H%M%S)"
trap 'dropdb --if-exists --maintenance-db="$DATABASE_SERVER_URL/postgres" "$database_name" >/dev/null 2>&1 || true; rm -rf "$work_dir"' EXIT

latest="$(rclone lsf "$RCLONE_REMOTE" --include "moneymentor-*.dump.age" | sort | tail -n 1)"
test -n "$latest"
rclone copyto "$RCLONE_REMOTE/$latest" "$work_dir/backup.dump.age"
age --decrypt --identity "$AGE_IDENTITY_FILE" --output "$work_dir/backup.dump" "$work_dir/backup.dump.age"
createdb --maintenance-db="$DATABASE_SERVER_URL/postgres" "$database_name"
pg_restore --dbname="$DATABASE_SERVER_URL/$database_name" --no-owner --no-acl --exit-on-error "$work_dir/backup.dump"
psql --dbname="$DATABASE_SERVER_URL/$database_name" --tuples-only --command='SELECT COUNT(*) FROM "__EFMigrationsHistory";' | grep -Eq '[1-9]'
