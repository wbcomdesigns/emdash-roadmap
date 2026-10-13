#!/usr/bin/env bash
# Rebuild the plugin, copy the kit and restart the lab WITHOUT wiping its data.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
cd "$PLUGIN" && npm run build && "$PLUGIN/scripts/apply-kit.sh"
cd "$LAB"
npx astro dev stop >/dev/null 2>&1 || true
npx astro dev start --host 127.0.0.1 --port "$PORT" >"/tmp/emdash-lab-$SLUG.log" 2>&1 &
until curl -sf "$BASE/_emdash/api/plugins/$SLUG/health" >/dev/null; do sleep 2; done
echo "Lab restarted at $BASE"
