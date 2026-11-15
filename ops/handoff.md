# Handoff: Product Roadmap (2026-11-15)

Live: **0.4.2** on the EmDash registry as `@vapvarun.bsky.social/roadmap`. Public page: https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/roadmap

Test on a fresh `create-emdash` blog site (registry install, kit from the release tag) and on the Cloudflare test site. On Cloudflare, redeploy after a registry install or update before judging anything (emdash-cms/emdash#4865).

## Next: 0.4.3

Milestone `0.4.3` on GitHub holds the work, in this order:

- #64 Fit every route, admin action and panel in Cloudflare's 10 requests per plugin call
- #67 Composite storage indexes for filtered and sorted queries
- #68 Move internal state from settings to kv
- #70 Guest vote logs two 401 console errors before the guest route succeeds
- #71 Ideas jumps back to page 1 after Approve or Reject
- #74 Next release: registry install text and shared kit

Then the release gate (`gate.sh`, which also checks that no public file carries machine paths and that the README is the product landing page), an independent walk on Node and Cloudflare, and publish only with the owner's go-ahead.

## Do not do

A registry release cannot be changed. Never republish `0.1.0`, `0.1.1` or `0.1.2`. Never `--allow-overwrite`. Never Basecamp.

## How to work

GitHub issues only. One pull request per version branch. No AI attribution. No em-dashes.
