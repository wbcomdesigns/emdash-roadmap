# Handoff: Product Roadmap (2026-10-20, 0.3.0 live, 0.4.0 in review)

You are the one agent for this repo. Read this, then work.

## Read first, in this order

1. Load the `emdash-plugin-development` skill.
2. EmDash's own guides in the lab site: `../emdash-lab-roadmap/.agents/skills/building-emdash-site` and `creating-plugins`.
3. `~/code/emdash-plugin-starter/EMDASH-SUPPORT.md`.
4. `SCOPE.md` here. The corrections section wins over older lines.
5. `PLAN.md` here.

## Where it stands

`0.3.0` is live. Registry: `@vapvarun.bsky.social/roadmap`. Registry installs mount at `r_76xywti6l5cbxzos`.

`0.4.0` (branch `0.4.0`, milestone 0.4.0, tracking issue #64) fits every entry point in Cloudflare's 10 requests per plugin call. `tests/bridge-budget.test.ts` pins every count (largest 9) and KNOWN_OVER is empty; `tests/review-0-4-0.test.ts` holds the races. Not merged, tagged or published.

What 0.4.0 changed in the data (read before touching counts):

- `tallies` rows are `{ v: 4, votes, live, seq }`, moved by `updateIf` deltas in the vote call. 0.3.0 rows (`{ votes }`) are rebuilt by `src/upgrade.ts`, whose state is the `upgrade_0_4` setting (salt, kit, rebuild, leftover, done). A fresh install marks it done.
- The guest salt (`visitor_salt`), the setup answer (`kit_done`), the guest address note (`guest_seen`) and a running merge (`merge_job`) are settings, read in one `settings.list` call.
- New hooks: `content:afterPublish/afterUnpublish/afterDelete/afterRestore` keep `live` and settle ideas (covered by content:read, no new capability).
- Merge and member erase run in steps (`mergeStep`, BUSY with reason MORE).
- Hourly-limit counters are in the `rates` storage collection; the upgrade's last phase (`rates`) deletes 0.3.0's kv `rate:*` keys. The 30-day guest cleanup waits while a merge or the rebuild/leftover recount runs.
- `tests/site.ts` runs every admin and editor panel answer through EmDash's Block Kit validator.

## Next

- Sonnet walk of `docs/qa/QA_CHECKLIST.md`, Cloudflare section first, on the testbed and on `~/code/emdash-lab-all`. Then the independent Opus review of `git diff v0.3.0..0.4.0`, then the release gate. Keep "Cloudflare: not supported yet" until the walk passes.

## Do not do

A registry release cannot be changed. Never republish `0.1.0`, `0.1.1` or `0.1.2`. Never `--allow-overwrite`. Never Basecamp.

## How to work

GitHub issues only. One pull request per version branch. No AI attribution. No em-dashes.
