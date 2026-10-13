#!/usr/bin/env bash
# Switch the lab's dev account between roles so a QA walk can be done as a real member.
# Usage: scripts/lab-role.sh subscriber|contributor|author|editor|admin
set -euo pipefail

source "$(dirname "$0")/lab-env.sh"
DB="$LAB_DB"

case "${1:-}" in
	subscriber) level=10 ;;
	contributor) level=20 ;;
	author) level=30 ;;
	editor) level=40 ;;
	admin) level=50 ;;
	*) echo "Usage: $0 subscriber|contributor|author|editor|admin" >&2; exit 1 ;;
esac

[[ -f "$DB" ]] || { echo "Lab database not found at $DB. Run scripts/reset-lab.sh first." >&2; exit 1; }
sqlite3 "$DB" "update users set role = $level where email = 'dev@emdash.local';"
echo "Lab dev account is now: $1 ($(sqlite3 "$DB" "select role from users where email = 'dev@emdash.local';"))"
echo "Sign in: $BASE/_emdash/api/setup/dev-bypass?redirect=/account/"
