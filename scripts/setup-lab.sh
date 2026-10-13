#!/usr/bin/env bash
# First run on a machine: create this plugin's own EmDash lab site, wire the plugin in, copy the kit.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"

echo "Plugin: $PLUGIN ($SLUG)"
echo "Lab:    $LAB on port $PORT"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<16)){console.error("Node.js 22.16 or later is required. Found "+process.version);process.exit(1)}'

cd "$PLUGIN"
[[ -d node_modules ]] || npm install --legacy-peer-deps

if [[ ! -f "$LAB/astro.config.mjs" && ! -f "$LAB/astro.config.ts" ]]; then
	[[ -e "$LAB" ]] && { echo "$LAB exists but is not an EmDash site." >&2; exit 1; }
	(cd "$(dirname "$LAB")" && npm create emdash@latest -- "$(basename "$LAB")" --template starter --platform node --pm npm --yes)
fi

node "$PLUGIN/scripts/wire-lab.mjs"
"$PLUGIN/scripts/apply-kit.sh"
(cd "$LAB" && npm install --legacy-peer-deps)

echo
echo "Next: $PLUGIN/scripts/reset-lab.sh then $PLUGIN/scripts/prove-lab.sh"
echo "Sign in: $BASE/_emdash/api/setup/dev-bypass?redirect=/"
