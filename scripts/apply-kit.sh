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
# The owner points this at their own layout, so never overwrite it.
if [[ -d "$PLUGIN/site-kit/layouts" ]]; then
	mkdir -p "$LAB/src/layouts"
	for file in "$PLUGIN/site-kit/layouts"/*; do
		name="$(basename "$file")"
		[[ -f "$LAB/src/layouts/$name" ]] || cp "$file" "$LAB/src/layouts/$name"
	done
fi
# Lab-only pages that mount the components for a browser walk.
if [[ -d "$PLUGIN/site-kit/lab" ]]; then
	mkdir -p "$LAB/src/pages"
	cp -R "$PLUGIN/site-kit/lab/." "$LAB/src/pages/"
fi
echo "Copied site-kit into $LAB"
