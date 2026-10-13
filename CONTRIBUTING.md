# Building this plugin

A sandboxed EmDash plugin has two halves, and both are the product:

- **The plugin** (`src/`): routes, storage and the Block Kit admin pages. It cannot add pages or CSS to a site.
- **The site kit** (`site-kit/`): components, styles and pages a site owner copies into their site.

## Layout

| Path | Role |
| --- | --- |
| `SCOPE.md` | The contract: scope, schema, routes, screens |
| `src/plugin.ts` | Routes and hooks |
| `src/admin.ts` | Block Kit admin pages |
| `src/core.ts` | Shared plugin helpers: member permission, rate limit |
| `emdash-plugin.jsonc` | Identity, capabilities, storage indexes, admin pages, registry branding |
| `site-kit/lib/wbcom-kit.ts` | Shared browser helpers: `api`, `esc`, `notify`. Identical in every Wbcom plugin |
| `site-kit/styles/wbcom-base.css` | Shared tokens and primitives. Identical in every Wbcom plugin |
| `site-kit/components`, `site-kit/pages` | What the site owner copies |
| `site-kit/lab` | Lab-only pages that mount the components for a browser walk |
| `tests/` | Route and admin tests on a real test site |
| `docs/qa/QA_CHECKLIST.md` | Release cases by role |
| `ops/handoff.md` | State of the work for the next session |

## Local loop

```bash
npm install --legacy-peer-deps
./scripts/setup-lab.sh        # once per machine: creates this plugin's own lab site
./scripts/reset-lab.sh        # test, build, wipe the lab database, start the lab
./scripts/prove-lab.sh        # route-level smoke
./scripts/restart-lab.sh      # after a change, without wiping lab data
./scripts/lab-role.sh subscriber   # walk member cases as the lowest signed-in role
```

Each plugin has its own lab folder (`../emdash-lab-<slug>`) and its own port (`lab.port` in `package.json`), so several plugins can be worked on at the same time. Sign in on the lab with `/_emdash/api/setup/dev-bypass?redirect=/`.

## Build rules

| Rule | Why |
| --- | --- |
| A `public: true` route never gets `routeCtx.user` | Member actions need a private route with `permission: MEMBER` (`content:read`, the lowest signed-in role). No permission set means admin only |
| Never read a member id from the request | It is the caller's to forge. Use `routeCtx.user.id` |
| Keep derived numbers (ratings, vote counts) in plugin storage | Then keeping them right never touches site content, and it is safe from a member route |
| `ctx.content.update` on a published entry only saves a draft | Republishing can push someone's unfinished edits live. Avoid writing to entries at all where you can |
| Block Kit tables need `page_action_id` | Without it the whole admin page is rejected, but only once it has a row |
| Block Kit `repeater` renders nothing inside a `form` | Use a textarea with one item per line |
| Admin shows exactly what gets approved | Full text, a name and not an id. Cap input length so the table can show all of it |
| Moderation clicks carry a version token (`rev`) | A member can rewrite a row between the admin seeing it and deciding |
| Anything a member writes that an admin page reads is isolated | Small batch, try/catch per item, so one bad record cannot stop the page |
| Storage queries use a declared index | Add the field to `storage.<collection>.indexes` in the manifest before you filter on it |
| Kit colours come from `wbcom-base.css` tokens | They use `light-dark()` and follow the site theme. Never a `.dark` class, never a raw colour in a component |
| Kit markup is the same for every visitor | Site pages are cached without regard to cookies. Sign-in state is decided in the browser from the API's answer |
| No outside scripts or styles in the kit | Sites run a content security policy that only allows their own. Ship what you need inside the kit |
| All visitor-facing text comes from one wording file | A non-English site, or one with its own vocabulary, changes one file. Routes return codes, not sentences |
| Empty, loading and error states on every list and form | A blank area reads as broken |
| Two clicks instead of `confirm()` | Browser dialogs are not allowed |

## The gate: all of it, before any release

A registry release cannot be changed or removed. Every check runs before `publish`.

1. `npm test` (validate, typecheck, tests) and `npm run build`.
2. `./scripts/reset-lab.sh` then `./scripts/prove-lab.sh`.
3. Walk `docs/qa/QA_CHECKLIST.md` in a browser as guest, member (subscriber) and admin, at 1440, 768 and 390, in light and dark. Update its "Last walk" line honestly: what was walked in the browser, what only at route level, what was not walked.
4. Wait for the automatic security review of the last pushed commit and fix what it finds. Do not tag while a review is outstanding.
5. Registry branding in the manifest: `name`, `description` (140 characters), up to 5 `keywords`, `sections` (2000 characters each), `release.artifacts` (icon 256x256, banner, up to 8 screenshots in `images/`). Screenshots come from a freshly reset lab with no test data.
6. The same version in `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/registry/changelog.md` and the git tag.
7. `npm run bundle` stays under 256 KB, 128 KB per file, 20 files.

## Publish (owner only)

```bash
gh pr merge <n> --admin --merge
git checkout main && git pull --ff-only && npm test && npm run build
git tag vX.Y.Z && git push origin vX.Y.Z
npx emdash-plugin whoami
npx emdash-plugin publish
npx emdash-plugin update-package --yes     # publish does not update name, description, keywords or sections
gh release create vX.Y.Z
npx emdash-plugin info <handle> <slug> --version X.Y.Z
```

A finding that arrives after publish gets a patch release only if a site owner is exposed. Otherwise file a card for the next milestone, so GitHub and the registry stay on the same version.

## Commits

Subject and body only. No AI co-author trailers. No em-dashes. One card per commit, after it is verified.
