# Handoff: Product Roadmap (2026-10-14, 0.1.0 ready for the owner to publish)

You are the one agent for this repo. Read this, then work.

## Read first, in this order

1. Load the `emdash-plugin-development` skill. It separates what EmDash core already gives every site, what a plugin may add, and the owner's standing rules.
2. EmDash's own guides in the lab site: `../emdash-lab-roadmap/.agents/skills/building-emdash-site` and `creating-plugins` (with `references/sandbox-boundaries.md`). They win over everything else.
3. `~/code/emdash-plugin-starter/EMDASH-SUPPORT.md`: what is proven, what is documented but not tried, what is not possible.
4. `SCOPE.md` here. Start with its section "Corrections after reading EmDash's own guides": it wins over older lines.
5. `PLAN.md` here: the order of work, at the end of the file.

## Where it stands

Branch `0.1.0`, PR https://github.com/wbcomdesigns/emdash-roadmap/pull/19. Schema, stages, Settings, dashboard card, hourly email, board, member and guest voting, suggest, Ideas queue, merge, item/suggest/changelog pages, wording file, lab scripts and registry branding are in. Tests: 25 passing. `./scripts/prove-lab.sh` passed. Bundle 37.6 KB.

Lab is `../emdash-lab-roadmap` on port 4335. `./scripts/reset-lab.sh` then open `/roadmap/`.

EmDash DELETE has no body. Take a vote back with `DELETE /vote?id=...` or `DELETE /vote_guest?id=...&visitor=...`.

Playwright MCP stays locked (`mcp-chrome-6cf007c`). Walks used isolated Chromium against the lab.

## Still open on purpose

- #8 My votes: 0.2.0.
- #18 in-text block: trusted install only. Not proven. Registry install is complete without it.

## Do not do

Never merge to `main`, never tag, never publish. The owner publishes after the gate in `CONTRIBUTING.md`. Wait for the automatic security review of the last pushed commit before tagging.

## How to work

- One pull request into `main`. GitHub issues only. Never Basecamp.
- Lab: `./scripts/setup-lab.sh`, `./scripts/reset-lab.sh`, `./scripts/prove-lab.sh`, `./scripts/lab-role.sh`.
- No AI attribution. No em-dashes.

## You stop when

The owner publishes, or the next milestone is locked.
