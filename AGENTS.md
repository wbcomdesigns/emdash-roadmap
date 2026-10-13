# Agent instructions

Read these in order before you change anything:

1. `ops/handoff.md`: where this plugin stands and what to do next.
2. `SCOPE.md`: what is in and out of scope, the data schema, the routes, the screens. It is the contract. If the code and `SCOPE.md` disagree, stop and fix one of them in the same pull request.
3. `CONTRIBUTING.md`: build rules, the gate that runs before every release, and the publish steps.
4. `docs/qa/QA_CHECKLIST.md`: the cases a release must pass.

Work is tracked as GitHub issues ("cards") under version milestones. Take a card, do all of it (function, screen, tests, QA case), and comment on the card with what you verified and how. One card per commit once it is verified.

## Hard rules

- Free scope only. Build what `SCOPE.md` lists under "In scope". Do not add anything under "Out of scope", and do not invent settings.
- A `public: true` route never receives `routeCtx.user`. Member actions are private routes with `permission: MEMBER`. Never read a member id from the request.
- A member route must not write to or publish site content, unless `SCOPE.md` names that exact write.
- Every value from the API goes through `esc()` before `innerHTML`.
- Kit markup must be the same for every visitor. Never render sign-in state on the server: site pages are cached without regard to cookies.
- `site-kit/lib/wbcom-kit.ts` and `site-kit/styles/wbcom-base.css` are shared by every Wbcom plugin. Do not edit them here. Change them in `emdash-plugin-starter` first, then copy.
- Verify in a real browser as guest, member (`./scripts/lab-role.sh subscriber`) and admin, at 1440, 768 and 390, in light and dark. A walk done only as admin is not a member walk.
- Never publish to the registry. A release cannot be changed. The owner publishes after the gate in `CONTRIBUTING.md` passes.
- This repository may become public. Keep exploit detail out of issues and commit messages.
- No AI co-author trailers. No em-dashes in docs, commits or UI text.
