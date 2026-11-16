# Handoff: Product Roadmap (2026-11-16)

Live: **0.4.2** on the EmDash registry as `@vapvarun.bsky.social/roadmap`. Public page: https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/roadmap

Test on a fresh `create-emdash` blog site (registry install, kit from the release tag) and on the Cloudflare test site. On Cloudflare, redeploy after a registry install or update before judging anything (emdash-cms/emdash#4865).

## In review: 0.4.3

Branch `0.4.3`, one pull request, not merged, tagged or published. Fixes #76 (long words in the Ideas table), #80 (each Decide names its idea), #71 (a decision keeps the page), #77 (no Remove on a stage with items), #78 (merge progress in the merge panel, fewer Continues), #79 (no faded vote buttons), #81 (Suggest names the field; members not asked for a name), #70 (no member requests for a known guest), #74 (install text and shared kit). Tests in `tests/release-0-4-3.test.ts` fail on v0.4.2.

Left open with a comment on each:

- #64: the call budget shipped in 0.4.0 (every entry point 9 or fewer, KNOWN_OVER empty, the guest "not on the board" cause fixed). Still needed: the Sonnet walk on the Cloudflare test site after publish.
- #67 (composite indexes) and #68 (settings to kv): not defects. Both change storage, and by #67's own note they belong in a minor (0.5.0).

Then the release gate, an independent walk on Node and Cloudflare, and publish only with the owner's go-ahead.

## Do not do

A registry release cannot be changed. Never republish `0.1.0`, `0.1.1` or `0.1.2`. Never `--allow-overwrite`. Never Basecamp.

## How to work

GitHub issues only. One pull request per version branch. No AI attribution. No em-dashes.
