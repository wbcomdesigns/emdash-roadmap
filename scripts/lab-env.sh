# Sourced by the lab scripts. Resolves the plugin, its own lab site and its own port.
PLUGIN="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SLUG="$(sed -n 's/.*"slug"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN/emdash-plugin.jsonc" | head -n 1)"
PORT="$(node -e 'const p=require(process.argv[1]+"/package.json");console.log((p.lab&&p.lab.port)||4321)' "$PLUGIN")"
LAB="${PLUGIN_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-lab-$SLUG}"
BASE="http://localhost:$PORT"
# The lab's SQLite file, read from its own config (the starter template has moved it before).
# Missing until setup-lab.sh creates the site, so this must not fail the first run.
LAB_DB=""
for config in "$LAB"/astro.config.mjs "$LAB"/astro.config.ts "$LAB"/astro.config.js; do
	[[ -f "$config" ]] || continue
	LAB_DB="$(sed -n 's/.*url:[[:space:]]*"file:\([^"]*\)".*/\1/p' "$config" | head -n 1)"
	break
done
LAB_DB="$LAB/${LAB_DB#./}"
[[ "$LAB_DB" == "$LAB/" ]] && LAB_DB="$LAB/data.db"
export PLUGIN_ROOT="$PLUGIN" PLUGIN_LAB="$LAB"
