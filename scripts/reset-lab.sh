#!/usr/bin/env bash
# Test, build, wipe the lab database and restart the lab dev server on this plugin's port.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
[[ -f "$LAB/package.json" ]] || { echo "Lab not found at $LAB. Run scripts/setup-lab.sh first." >&2; exit 1; }

cd "$PLUGIN"
npm test
npm run build
"$PLUGIN/scripts/apply-kit.sh"

rm -f "$LAB_DB" "$LAB_DB-wal" "$LAB_DB-shm"

cd "$LAB"
npx astro dev stop >/dev/null 2>&1 || true
npx astro dev start --host 127.0.0.1 --port "$PORT" >"/tmp/emdash-lab-$SLUG.log" 2>&1 &
for _ in $(seq 1 60); do
	if curl -sf "$BASE/_emdash/api/plugins/$SLUG/health" >/dev/null; then
		curl -sf "$BASE/_emdash/api/setup/dev-bypass?redirect=/" >/dev/null
		echo "Lab is up at $BASE"
		exit 0
	fi
	sleep 1
done
echo "Lab did not become healthy. Tail:" >&2
tail -n 40 "/tmp/emdash-lab-$SLUG.log" >&2
exit 1
