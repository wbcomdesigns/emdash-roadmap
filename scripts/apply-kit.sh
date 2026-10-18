#!/usr/bin/env bash
# Copy the site kit into the lab exactly as a site owner does (scripts/add-to-site.sh), plus the
# lab-only pages. The lab gets its content types from its own seed (merge-seed.mjs), so no seed run here.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
[[ -d "$LAB/src" ]] || { echo "Lab not found at $LAB. Run scripts/setup-lab.sh first." >&2; exit 1; }

"$PLUGIN/scripts/add-to-site.sh" "$LAB" --no-seed >/dev/null
if [[ -d "$PLUGIN/site-kit/lab" ]]; then
	mkdir -p "$LAB/src/pages"
	cp -R "$PLUGIN/site-kit/lab/." "$LAB/src/pages/"
fi
echo "Copied site-kit into $LAB"
