# Handoff: Product Roadmap (2026-10-14, 0.1.2 live)

You are the one agent for this repo. Read this, then work.

## Read first, in this order

1. Load the `emdash-plugin-development` skill.
2. EmDash's own guides in the lab site: `../emdash-lab-roadmap/.agents/skills/building-emdash-site` and `creating-plugins`.
3. `~/code/emdash-plugin-starter/EMDASH-SUPPORT.md`.
4. `SCOPE.md` here. The corrections section wins over older lines.
5. `PLAN.md` here.

## Where it stands

`0.1.2` is live. Registry: `@vapvarun.bsky.social/roadmap@0.1.2`. Tag `v0.1.2`. Listing name is Product Roadmap. Page: https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/roadmap

Lab is `../emdash-lab-roadmap` on port 4335. `./scripts/reset-lab.sh` then open `/roadmap/`.

0.1.1 covered #25, #23, #24. 0.1.2 covered #27 (suggestions off), #28 (merge names), #29 (filters and tabs). #8 and #18 stay open. #30 is the next admin rebuild (tabs, stats, combobox merge), not a 0.1.x patch.

## Next

- #30 is on branch 0.2.0, not merged. Settings uses three tabs. Each stage keeps its own form inside the Stages tab, plus Add a stage. A repeater is not used: renaming a stage must keep its items, and a repeater on an admin form is not proven.
- #8 My votes is on the same 0.2.0 branch: `/account/roadmap-votes/`, second click, member id from the session.
- #18 in-text block is on the same 0.2.0 branch. It is trusted site code. The block is the board for the current page, with one fixed choice and no list. The registry plugin is unchanged.
- Findings after publish: patch only if a site owner is exposed. Otherwise a card for the next milestone.

## Do not do

A registry release cannot be changed. Never republish `0.1.0`, `0.1.1` or `0.1.2`. Never `--allow-overwrite`. Never Basecamp.

## How to work

GitHub issues only. One pull request per version branch. No AI attribution. No em-dashes.
