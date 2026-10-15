#!/usr/bin/env bash
# Copy the site kit into the lab the same way a site owner would: lib, styles, components, pages.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
[[ -d "$LAB/src" ]] || { echo "Lab not found at $LAB. Run scripts/setup-lab.sh first." >&2; exit 1; }

# The two shared files are used by every Wbcom plugin on the site. Never replace a newer copy
# that another plugin put there with an older one: compare the number on their first line.
# A copy from before the numbers existed counts as 0.
shared_version() { local v; v="$(sed -n '1s/.*wbcom-shared: *\([0-9]*\).*/\1/p' "$1" 2>/dev/null)"; echo "${v:-0}"; }
for part in lib styles components pages; do
	[[ -d "$PLUGIN/site-kit/$part" ]] || continue
	mkdir -p "$LAB/src/$part"
	for file in "$PLUGIN/site-kit/$part"/*; do
		[[ -e "$file" ]] || continue
		name="$(basename "$file")"
		target="$LAB/src/$part/$name"
		if [[ "$name" == wbcom-base.css || "$name" == wbcom-kit.ts ]] && [[ -f "$target" ]]; then
			(( $(shared_version "$file") >= $(shared_version "$target") )) || continue
		fi
		if [[ -d "$file" ]]; then
			mkdir -p "$target"
			cp -R "$file"/. "$target"/
		else
			cp "$file" "$target"
		fi
	done
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
if [[ -d "$PLUGIN/site-kit/blocks" ]]; then
	mkdir -p "$LAB/src/roadmap-block"
	cp -R "$PLUGIN/site-kit/blocks/." "$LAB/src/roadmap-block/"
fi
echo "Copied site-kit into $LAB"
