# Sourced by the lab scripts. Resolves the plugin, its own lab site and its own port.
PLUGIN="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SLUG="$(sed -n 's/.*"slug"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN/emdash-plugin.jsonc" | head -n 1)"
PORT="$(node -e 'const p=require(process.argv[1]+"/package.json");console.log((p.lab&&p.lab.port)||4321)' "$PLUGIN")"
LAB="${PLUGIN_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-lab-$SLUG}"
BASE="http://localhost:$PORT"
# The lab's SQLite file, read from its own config (the starter template has moved it before).
LAB_DB="$(sed -n 's/.*url:[[:space:]]*"file:\([^"]*\)".*/\1/p' "$LAB"/astro.config.* 2>/dev/null | head -n 1)"
LAB_DB="$LAB/${LAB_DB#./}"
[[ "$LAB_DB" == "$LAB/" ]] && LAB_DB="$LAB/data.db"
export PLUGIN_ROOT="$PLUGIN" PLUGIN_LAB="$LAB"
