#!/usr/bin/env bash
# Adds the Product Roadmap visitor pages to an EmDash site. Run it from a checkout of the release
# tag that matches the plugin version you installed:
#
#   kit="$(mktemp -d)" &&
#     git clone --depth 1 \
#       --branch v0.2.2 \
#       https://github.com/wbcomdesigns/emdash-roadmap \
#       "$kit/emdash-roadmap" &&
#     "$kit/emdash-roadmap/scripts/add-to-site.sh" .
#
# Safe to run again after every plugin update. It replaces Roadmap's own kit files, never replaces
# a newer shared Wbcom file another plugin copied, never touches src/layouts/RoadmapLayout.astro
# once it exists, and keeps a dated backup of the wording file only when you edited it yourself
# (its hash is not one of a released version's, listed in site-kit/lib/roadmap-strings.sums).
set -euo pipefail

PLUGIN="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$PLUGIN/site-kit"
SITE_ARG="${1:-}"
SEED=1
[[ "${2:-}" == "--no-seed" ]] && SEED=0

usage() { echo "Usage: $0 /path/to/your/emdash/site" >&2; }
[[ -n "$SITE_ARG" ]] || { usage; exit 1; }
[[ -d "$SITE_ARG" ]] || { echo "$SITE_ARG is not a folder." >&2; usage; exit 1; }
SITE="$(cd "$SITE_ARG" && pwd)"

if ! ls "$SITE"/astro.config.* >/dev/null 2>&1 || ! grep -qs "emdash" "$SITE"/astro.config.* || [[ ! -d "$SITE/src" ]]; then
	echo "$SITE is not an EmDash site (no src/ folder and no astro.config that loads emdash)." >&2
	usage
	exit 1
fi

today="$(date +%Y%m%d)"
notes=()

# The two shared files are used by every Wbcom plugin on the site. Copy one only when the site's
# copy is missing or has a lower number on its first line ("wbcom-shared: N"; none counts as 0).
shared_version() { local v; v="$(sed -n '1s/.*wbcom-shared: *\([0-9]*\).*/\1/p' "$1" 2>/dev/null)"; echo "${v:-0}"; }

# The site's strings file is untouched when its hash is one a released version shipped.
released_strings() {
	local hash
	hash="$( (shasum -a 256 "$1" 2>/dev/null || sha256sum "$1") | cut -d" " -f1)"
	grep -qx "$hash" "$KIT/lib/roadmap-strings.sums"
}

copy_file() {
	local from="$1" to="$2" name
	name="$(basename "$from")"
	if [[ "$name" == wbcom-base.css || "$name" == wbcom-kit.ts ]] && [[ -f "$to" ]]; then
		local have want
		have="$(shared_version "$to")"
		want="$(shared_version "$from")"
		if (( want < have )); then
			notes+=("Kept ${to#"$SITE/"}: the site already has a newer shared copy (wbcom-shared $have; this kit has $want).")
			return
		fi
		if (( want > have )); then
			notes+=("Upgraded ${to#"$SITE/"} from wbcom-shared $have to $want. Other Wbcom plugins on this site use it too; it only ever adds.")
		fi
	fi
	if [[ "$name" == roadmap-strings.ts && -f "$to" ]] && ! cmp -s "$from" "$to" && ! released_strings "$to"; then
		local backup="$to.bak-$today"
		cp "$to" "$backup"
		notes+=("Your wording file had your own changes. Your copy is saved as ${backup#"$SITE/"}; move your changes back into ${to#"$SITE/"}.")
	fi
	cp "$from" "$to"
}

for part in lib styles components pages; do
	[[ -d "$KIT/$part" ]] || continue
	while IFS= read -r -d '' file; do
		rel="${file#"$KIT/$part/"}"
		[[ "$(basename "$rel")" == .gitkeep || "$rel" == *.sums ]] && continue
		mkdir -p "$(dirname "$SITE/src/$part/$rel")"
		copy_file "$file" "$SITE/src/$part/$rel"
	done < <(find "$KIT/$part" -type f -print0)
done

# The layout is the site's own once it exists: never overwrite it.
mkdir -p "$SITE/src/layouts"
layout_state="yours, left as it is"
if [[ ! -f "$SITE/src/layouts/RoadmapLayout.astro" ]]; then
	cp "$KIT/layouts/RoadmapLayout.astro" "$SITE/src/layouts/RoadmapLayout.astro"
	layout_state="new"
fi
if [[ "$layout_state" == new && ! -f "$SITE/src/layouts/Base.astro" ]]; then
	notes+=("src/layouts/RoadmapLayout.astro hands pages to ./Base.astro, which this site does not have. Change its import to your site's layout.")
fi

# Optional in-text board block (a trusted install only). Nothing uses it until astro.config.mjs does.
mkdir -p "$SITE/src/roadmap-block"
cp -R "$KIT/blocks/." "$SITE/src/roadmap-block/"

# The roadmap and changelog content types: one seed file, applied without content or menus.
mkdir -p "$SITE/.emdash"
cp "$KIT/seed/roadmap-seed.json" "$SITE/.emdash/roadmap-seed.json"
seed_cmd="npx emdash seed .emdash/roadmap-seed.json --no-content"
seed_state="not run"
if (( SEED )); then
	if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)' 2>/dev/null; then
		if (cd "$SITE" && $seed_cmd >/dev/null 2>&1); then
			seed_state="done (content types that already existed were left alone)"
		else
			seed_state="failed, run it yourself (below)"
		fi
	else
		seed_state="skipped: needs Node 22.16 or later (this is $(node -v 2>/dev/null || echo "no node")), run it yourself (below)"
	fi
fi

cat <<DONE
Product Roadmap kit $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/package.json" | head -n 1) copied into $SITE

  Pages    src/pages/roadmap/ (board, one item, suggest an idea)
           src/pages/changelog/ (changelog, one release)
           src/pages/account/roadmap-votes.astro (Roadmap votes)
  Kit      src/lib/, src/styles/, src/components/ (Roadmap files and the shared Wbcom files)
  Wording  src/lib/roadmap-strings.ts
  Layout   src/layouts/RoadmapLayout.astro ($layout_state)
  Block    src/roadmap-block/ (optional board block for post text, off until astro.config.mjs uses it)
  Seed     .emdash/roadmap-seed.json: $seed_state

DONE

for note in "${notes[@]+"${notes[@]}"}"; do echo "  Note: $note"; done
[[ ${#notes[@]} -gt 0 ]] && echo

cat <<DONE
Left for you:

  1. Content types. If the seed above did not run, from the site root (Node 22.16 or later):
       cd "$SITE" && $seed_cmd
     Add -d <file> if your database is not ./data.db.
  2. Templates: nothing to paste. The kit brings its own pages.
  3. Restart the dev server (stop it, then npm run dev). New pages are not picked up until then.
  4. In the admin, open Menus and add these links:
       Roadmap        /roadmap/
       Changelog      /changelog/
       Roadmap votes  /account/roadmap-votes/
  5. Open /roadmap/, /roadmap/suggest/, /changelog/ and /account/roadmap-votes/.
  6. In the admin, open Roadmap, Settings: who can take part, stages, and the hourly email.

After every plugin update, run this again from the site root, with the new tag:
  kit="\$(mktemp -d)" &&
    git clone --depth 1 \\
      --branch v<new version> \\
      https://github.com/wbcomdesigns/emdash-roadmap \\
      "\$kit/emdash-roadmap" &&
    "\$kit/emdash-roadmap/scripts/add-to-site.sh" .

Guide: https://github.com/wbcomdesigns/emdash-roadmap/blob/v$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/package.json" | head -n 1)/docs/website/getting-started/install.md
DONE
