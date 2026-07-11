#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
dump_path="$work_dir/moneymentor-$timestamp.dump"
encrypted_path="$dump_path.age"

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$dump_path"
age --recipient "$AGE_RECIPIENT" --output "$encrypted_path" "$dump_path"
rclone copyto "$encrypted_path" "$RCLONE_REMOTE/$(basename "$encrypted_path")"
rclone delete "$RCLONE_REMOTE" --min-age 14d --include "moneymentor-*.dump.age"
