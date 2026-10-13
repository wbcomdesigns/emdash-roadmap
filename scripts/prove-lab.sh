#!/usr/bin/env bash
# Route-level smoke on the running lab. Add one check per route as you build it.
set -euo pipefail
source "$(dirname "$0")/lab-env.sh"
API="$BASE/_emdash/api/plugins/$SLUG"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { echo "PASS: $1"; }
json() { curl -sf -H "X-EmDash-Request: 1" -H "Origin: $BASE" "$@"; }
status() { curl -s -o /dev/null -w "%{http_code}" -H "X-EmDash-Request: 1" -H "Origin: $BASE" "$@"; }

json "$API/health" | grep -q '"ok":true' || fail "health"
ok "health"

# Member and admin routes must refuse guests. List every such route here.
GUEST_REFUSED_ROUTES="${GUEST_REFUSED_ROUTES:-vote votes}"
for route in $GUEST_REFUSED_ROUTES; do
	[[ "$(status "$API/$route")" == "401" ]] || fail "guest refused on $route"
done
ok "guests refused on member and admin routes"

JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
curl -sf -c "$JAR" -o /dev/null "$BASE/_emdash/api/setup/dev-bypass?redirect=/"
[[ "$(status -b "$JAR" -X POST -H 'Content-Type: application/json' -d '{"type":"page_load","page":"/ideas"}' "$API/admin")" == "200" ]] || fail "admin page loads"
ok "admin page loads"

# plugin-specific checks go below this line
json -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"type":"page_load","page":"/settings"}' "$API/admin" | grep -q "Under review" || fail "settings page"
ok "settings page loads"
json -b "$JAR" -X POST -H "Content-Type: application/json" -d '{"type":"page_load","widget":"waiting"}' "$API/admin" | grep -q "waiting" || fail "dashboard card"
ok "dashboard card loads"
json "$API/board" | grep -q "Under review" || fail "board columns"
json "$API/board" | grep -q "Dark mode for the board" || fail "board items"
ok "board groups published items"
json "$API/board?category=docs" | grep -q "Setup guide" || fail "board category filter"
if json "$API/board?category=docs" | grep -q "Dark mode for the board"; then fail "board category leaked another category"; fi
ok "board filters by category"

BOARD_PAGE="$(curl -sf "$BASE/roadmap/")"
echo "$BOARD_PAGE" | grep -q 'id="roadmap"' || fail "board page"
ok "board page loads"

ITEM="$(json "$API/board" | node -e '
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
	const parsed = JSON.parse(raw);
	const data = parsed.data && parsed.data.columns ? parsed.data : parsed;
	const item = (data.columns || []).flatMap((column) => column.items || [])[0];
	if (!item || !item.id) process.exit(1);
	process.stdout.write(item.id);
});
')" || fail "board has an item to vote on"
VOTED="$(json -b "$JAR" -X POST -H "Content-Type: application/json" -d "{\"id\":\"$ITEM\",\"member_id\":\"someone-else\"}" "$API/vote")"
echo "$VOTED" | grep -q '"voted":true' || fail "member vote"
echo "$VOTED" | grep -q '"votes":1' || fail "vote count after vote"
json -b "$JAR" "$API/votes" | grep -q "$ITEM" || fail "votes lists own item"
UNVOTED="$(json -b "$JAR" -X DELETE "$API/vote?id=$ITEM")"
echo "$UNVOTED" | grep -q '"voted":false' || fail "take vote back"
echo "$UNVOTED" | grep -q '"votes":0' || fail "vote count after take back"
MISSING="$(curl -s -b "$JAR" -H "X-EmDash-Request: 1" -H "Origin: $BASE" -X POST -H "Content-Type: application/json" -d '{"id":"no-such-item"}' "$API/vote")"
echo "$MISSING" | grep -q "NOT_FOUND" || fail "missing item refused"
ok "member can vote, take it back, and a missing item is refused"

echo "All checks passed for $SLUG"
