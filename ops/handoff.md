# Handoff: Roadmap and Feature Voting

Read this first. Then `SCOPE.md`, `PLAN.md`, `AGENTS.md`, `CONTRIBUTING.md` and `docs/qa/QA_CHECKLIST.md`.

## Where it stands (2026-10-13)

Starter only. Nothing built.

| Thing | Where |
| --- | --- |
| Repo | `wbcomdesigns/emdash-roadmap`, local `~/code/emdash-roadmap` |
| Registry package | `@vapvarun.bsky.social/roadmap` (not published) |
| Lab site | `~/code/emdash-lab-roadmap`, port 4335 |
| Cards | GitHub issues in this repo, milestone `0.1.0` |
| Reference plugin | `~/code/emdash-listora` (shipped), `~/code/emdash-reviews` (same starter, engine built) |
| Shared starter | `~/code/emdash-plugin-starter` |

## Start

```bash
cd ~/code/emdash-roadmap
npm install --legacy-peer-deps
npm test
./scripts/setup-lab.sh
./scripts/reset-lab.sh
```

## Cards, in order

1. Schema, manifest and the collections
2. Board route
3. Voting
4. Suggest an idea
5. Admin ideas queue
6. Board page and vote button
7. Item page, suggest page, changelog page
8. My votes and erase
9. Guest participation
10. Rename the stages
11. Comments on idea pages
12. Lab, prove script, owner docs
13. Registry branding and release gate

Each card lists what to build, when it is UX ready, when it is function ready, and the QA cases that prove it. A card is done when all three hold and you have commented on it with what you verified and how. Take them in order: later cards assume earlier ones.

## Decisions already made

- Free scope only. `SCOPE.md` lists what is in and what is out.
- Members sign in with their EmDash account. Guests can do only what `SCOPE.md` marks public.
- Kit markup is the same for every visitor, because site pages are cached without regard to cookies.
- The owner publishes. Agents stop at a passing gate and hand over.

## Watch for

- This is the one plugin where a member route writes site content: `suggest` creates a DRAFT item. It must never publish and never update an existing entry. Publishing happens only on admin approval
- Approving publishes the draft the member wrote. The admin table must show the full title and description, and the click must carry the idea's `rev`
- Vote counts live in `tallies`, never on the entry, so voting never touches content
- The board reads 100 items and their tallies. Decide paging before a board grows past that
- Status is a field on the entry, changed in the content admin. The plugin only reads it
- Board pages are cached. Own-vote marks load in the browser from `votes`
- Kit pages must not import starter-only files
- Guest routes are public writes. Per-visitor limit, honeypot, length caps, and refuse when the host gives no IP. Never trust a visitor id from the request: derive it from the request's IP on the server
- The collection must have comments enabled for the idea page to show them. The kit's collection definition turns them on, and the page must cope when the owner turns them off

## When you stop

Rewrite "Where it stands" with the date and the truth: what works, what was verified and how, what was not verified. Update `docs/qa/QA_CHECKLIST.md`'s last-walk line the same way.
