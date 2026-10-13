#!/usr/bin/env bash
# Copy the site kit into the lab the same way a site owner would: lib, styles, components, pages.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
[[ -d "$LAB/src" ]] || { echo "Lab not found at $LAB. Run scripts/setup-lab.sh first." >&2; exit 1; }

for part in lib styles components pages; do
	[[ -d "$PLUGIN/site-kit/$part" ]] || continue
	mkdir -p "$LAB/src/$part"
	cp -R "$PLUGIN/site-kit/$part/." "$LAB/src/$part/"
done
# Lab-only pages that mount the components for a browser walk.
if [[ -d "$PLUGIN/site-kit/lab" ]]; then
	mkdir -p "$LAB/src/pages"
	cp -R "$PLUGIN/site-kit/lab/." "$LAB/src/pages/"
fi
echo "Copied site-kit into $LAB"
