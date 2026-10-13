# Handoff: Product Roadmap (2026-10-14, voting and board page on 0.1.0)

You are the one agent for this repo. Read this, then work.

## Read first, in this order

1. Load the `emdash-plugin-development` skill. It separates what EmDash core already gives every site, what a plugin may add, and the owner's standing rules.
2. EmDash's own guides in the lab site: `../emdash-lab-roadmap/.agents/skills/building-emdash-site` and `creating-plugins` (with `references/sandbox-boundaries.md`). They win over everything else.
3. `~/code/emdash-plugin-starter/EMDASH-SUPPORT.md`: what is proven, what is documented but not tried, what is not possible.
4. `SCOPE.md` here. Start with its section "Corrections after reading EmDash's own guides": it wins over older lines.
5. `PLAN.md` here: the order of work, at the end of the file.

## Where it stands

Branch `0.1.0`. Schema, collections, stages, Settings, dashboard card, hourly email, the public `board` route, member `vote` / `votes`, and a kit board page with a Vote button are in. Tests pass. Lab is `../emdash-lab-roadmap` on port 4335. Open `/roadmap/` after `./scripts/reset-lab.sh`.

EmDash DELETE has no body. Take a vote back with `DELETE /vote?id=...`.

Playwright MCP stays locked (`mcp-chrome-6cf007c`). Walks used isolated Chromium against the lab.

## Start with

#4 suggest. Then #11 guests, #5 ideas queue, #17 merge. Item and changelog pages are still #7.

## Prove before you build on it

EmDash comments on the item page. A redirect on merge (`redirects:write`). The hourly task (code and tests done; not yet seen firing on its own on the lab). A trusted-install block (#18, late).

Prove each on the lab first. If a proof fails, stop, write what you tried and what happened on the task's issue, and wait for the owner. Not possible on EmDash means the idea is dropped, not worked around.

## Not in this release

Emails to voters, several roadmaps, other layouts, `<MyVotes>` (0.2.0), the typed product label (categories replace it).

## How to work

- Branch `0.1.0` from `main`. Commit per finished task. Open one pull request into `main` and keep pushing to it.
- Lab: `./scripts/setup-lab.sh` creates `../emdash-lab-roadmap` on port 4335. `./scripts/reset-lab.sh`, `./scripts/prove-lab.sh`, `./scripts/lab-role.sh`. To walk visitor features on the lab, the lab already has `trustedProxyHeaders: ["x-forwarded-for"]`. Send that header, and also walk the cookie fallback without it.
- Copy proven patterns from `~/code/emdash-listora` (branch `0.5.0`): the hourly notice task `notifyOwners`, guarded writes with `updateIf`, the compare-and-set rate limit, the version token on every admin decision, the single layout file in the kit.
- A task is done when its tests pass and you have walked it in a browser as a visitor and as the admin, including a failed request, at 1440 and 390, in light and dark. Say on the issue what you walked and what you did not.
- Add each task's cases to `docs/qa/QA_CHECKLIST.md`.
- No AI attribution in commits or pull requests. No em-dashes. Plain words in everything a site owner reads.

## You stop when

Every 0.1.0 task is closed with a verification comment, the checklist has an honest last-walk line, and the pull request is open. You never merge into `main`, never tag, never publish. A registry release cannot be changed. The owner releases.

## Who checks your work

The Listora session reviews each plugin's pull request against `SCOPE.md` and walks it in a browser before the owner releases. Leave the lab in a state that can be reset and walked.
