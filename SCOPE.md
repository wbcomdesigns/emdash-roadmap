# Roadmap and Feature Voting: scope

This file is the contract for the plugin. Code, tests, docs and cards all follow it. If something here is wrong, change it here first, in the same pull request as the code.

## Purpose

Show customers what is planned, let signed-in members vote and suggest ideas, and let the owner decide what moves forward. A changelog shows what shipped.

**Who it is for:** Product companies, plugin and theme shops, SaaS and open source projects.

**WordPress source:** Product Roadmap (`~/dev/repos/product-roadmap`, manifest at `audit/manifest.json`) for scope and wording. Its admin has Roadmap, Changelog, Products, Dashboard and Settings. Do not copy PHP.

**Brand:** Logos: `~/Documents/brand logos/product-roadmap/`. Use the mark, never boxed in a tile.

## Fits every kind of site

This plugin must work for any site owner, not one niche. Judge every screen and every word against this table.

| Kind of site | How the owner uses it |
| --- | --- |
| Blog or magazine | What should we write about next |
| Business or service site | Services and improvements clients ask for |
| Shop or product site | Products and variants customers want |
| Community or membership | Member-driven priorities for the community |
| Docs or SaaS | The classic product roadmap and changelog |
| Portfolio or agency | A client-facing project plan with status |

**Member accounts:** Works with or without member accounts. The owner chooses who can take part.

How it stays general:

- Status names are fixed in 0.1.0 but their display labels are owner-editable, so "Planned" can read "Coming up" or "On our list"
- "Product" is an optional free label. A site with one product or none ignores it
- Page titles (Roadmap, Ideas, What's next) are set by the owner

**Decided by the owner on 2026-10-13: the site owner chooses who can take part.** One setting: signed-in members only, or anyone. For a guest: one entry per visitor, identified by a salted hash of the IP (never the IP itself, never a cookie the visitor can clear to vote again within the hour limit), an hourly limit per visitor, a honeypot field on every guest form, and written content always held for approval. Guests have no account, so they have no "My ..." list and cannot erase their entries themselves; the owner removes them in admin. If the host supplies no IP, every guest shares one bucket: refuse guest writes in that case and say why in the admin page. Member routes stay private routes using `routeCtx.user`. Guest routes are separate public routes: never merge the two paths.

## Decisions made with the owner

Settled. Do not reopen these in code review. Dated 2026-10-13 unless noted.

| Question | Decision |
| --- | --- |
| Who can take part | The site owner chooses: signed-in members only, or anyone. Default is anyone. |
| Stages on the board | Four stages in a fixed order. The owner renames each one. |
| Discussion on an idea | Yes, using EmDash's own comments on the idea page. The plugin builds no comment system. |

## In scope for 0.1.0

- Roadmap items live in an EmDash collection (`roadmap`): title, description, status, optional product label
- Four fixed statuses: Under review, Planned, In progress, Done
- Public board: one column per status, sorted by votes, with a filter by product label
- Item page with description, status and vote button
- One vote per member per item. Click again to take it back
- Members suggest an idea: it is created as a draft and waits in the admin queue
- Admin: ideas queue (approve publishes it as Under review, reject), settings
- Changelog: a second collection (`changelog`) with a kit page. No plugin logic
- Drop-in `<MyVotes>` for an account page, with delete-my-votes
- Setting "Who can take part": signed-in members only, or anyone. A guest gets one vote per visitor per item, and can suggest an idea with a display name. Ideas always wait for approval
- The owner renames the four stages in settings. The order and the number stay fixed
- Idea pages show EmDash's own comment list and form, with EmDash's moderation

## Out of scope

Do not build these. If a card seems to need one, stop and ask the owner.

- Notifying voters when status changes
- Private boards
- Multiple boards
- Importing from other tools
- Any paid or Pro feature
- Email sending (the host may have no mail configured)
- Portable Text blocks or anything that needs a native plugin
- Injecting scripts, styles or HTML into pages from the plugin
- Adding, removing or reordering stages
- A comment system of our own

## Roles

| Role | Can do |
| --- | --- |
| Guest | Everything marked `public` in the routes table |
| Member | Signed in at subscriber role or above. Everything marked `member`, acting only on their own data |
| Admin | Everything marked `admin`, from the EmDash admin |

## Capabilities

`content:read`, `content:write`, `content:publish`, `schema:read`

Ask for nothing more without the owner's agreement: every capability is shown to the site owner at install.

## Data schema

### `votes`

Row id: `<itemId>:<memberId>`. A guest's vote id is `<itemId>:v-<visitorHash>`. Indexes: `item`, `member_id`.

| Field | Type | Notes |
| --- | --- | --- |
| `item` | string | Roadmap entry id |
| `member_id` | string | From `routeCtx.user.id` |
| `createdAt` | string | ISO time |
| `visitor` | string | Guests only: SHA-256 of the IP plus a per-site salt. Empty for members |

### `tallies`

Row id: `<itemId>`. Indexes: `votes`.

| Field | Type | Notes |
| --- | --- | --- |
| `votes` | number | Recounted with `storage.count` on every vote change |

### `ideas`

Row id: `<itemId>`. Indexes: `status`, `member_id`, `createdAt`.

| Field | Type | Notes |
| --- | --- | --- |
| `member_id` | string | Who suggested it |
| `title` | string | Up to 120 characters |
| `status` | string | `pending`, `approved` or `rejected` |
| `rev` | string | Random token. Moderation clicks must match it |
| `createdAt` | string | ISO time |
| `visitor` | string | Guests only, same hash |
| `name` | string | Guest's display name, up to 60 characters |

## Settings

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `allow_ideas` | boolean | `true` | Members can suggest ideas |
| `title` | string | `Roadmap` | Heading on the board page. The owner's own word for it |
| `status_labels` | string | `Under review, Planned, In progress, Done` | Display names for the four statuses, in order. The statuses themselves are fixed |
| `collection` | string | `roadmap` | Collection that holds the items |
| `who` | string | `anyone` | `members` or `anyone` |

## Routes

Base: `/_emdash/api/plugins/roadmap/<name>`.

| Route | Who | Methods | Input | Returns |
| --- | --- | --- | --- | --- |
| `health` | public | GET | - | `ok`, version, whether the collection exists |
| `board` | public | GET | `product` (optional) | Published items grouped by status with vote counts. 100 items max |
| `votes` | member | GET | - | Ids of the items the caller voted for, so the board can mark them |
| `vote` | member | POST, DELETE | `id` | New vote count for the item |
| `suggest` | member | POST | `title`, `description` | Creates a draft item and a pending idea. Rate limited |
| `mine` | member | GET, DELETE | - | GET: own votes and ideas with status. DELETE: erase own votes |
| `vote_guest` | public | POST, DELETE | `id`, honeypot field | New vote count. Refused when the setting is members |
| `suggest_guest` | public | POST | `title`, `description`, `name`, honeypot field | Creates a draft item and a pending idea. Refused when the setting is members |
| `admin` | admin | POST | Block Kit | Ideas queue and settings |

`member` means a private route with `permission: MEMBER`. `admin` means a private route with no permission set. A `public` route never receives a user.

## Hooks

None.

## Admin screens

| Page | What it shows |
| --- | --- |
| `/ideas` | Stats, pending ideas table with full text and Approve / Reject, settings. Items themselves are edited in the EmDash content admin |

## Site kit

| File | What it is |
| --- | --- |
| `site-kit/seed/collection.mjs` | `roadmap` and `changelog` collections |
| `site-kit/pages/roadmap/index.astro` | The board |
| `site-kit/pages/roadmap/[slug].astro` | Item page. Mounts EmDash `Comments` and `CommentForm` |
| `site-kit/pages/roadmap/suggest.astro` | Idea form |
| `site-kit/pages/changelog/index.astro` | Changelog |
| `site-kit/components/VoteButton.astro` | `<VoteButton id />` |
| `site-kit/components/MyVotes.astro` | `<MyVotes />` |
| `site-kit/styles/roadmap.css` | Board columns and cards |

Plus the two shared files every Wbcom plugin kit carries: `site-kit/lib/wbcom-kit.ts` and `site-kit/styles/wbcom-base.css`.

## Screens and their states

A screen is done when every state listed here has been seen in a browser at 1440, 768 and 390, in light and dark.

| Screen | States that must exist |
| --- | --- |
| Board | Four columns on desktop, tabs with one column at a time on a phone, vote counts, own votes marked after load, product filter, empty state per column |
| Vote button | Idle, voted, busy, guest sign-in prompt. Count updates in place. Reads as a toggle to a screen reader |
| Item page | Status badge, description, vote button, back to board |
| Suggest form | Idle, busy, thanks with what happens next, validation, guest sign-in prompt, ideas turned off |
| Changelog | Entries newest first, grouped by month, empty state |
| Admin queue | Full idea text, the member's name, empty state |
| Comments on an idea | EmDash's comment list and form below the description. Closed when the site has comments turned off, with no broken box |

## Risks and open questions

- This is the one plugin where a member route writes site content: `suggest` creates a DRAFT item. It must never publish and never update an existing entry. Publishing happens only on admin approval
- Approving publishes the draft the member wrote. The admin table must show the full title and description, and the click must carry the idea's `rev`
- Vote counts live in `tallies`, never on the entry, so voting never touches content
- The board reads 100 items and their tallies. Decide paging before a board grows past that
- Status is a field on the entry, changed in the content admin. The plugin only reads it
- Board pages are cached. Own-vote marks load in the browser from `votes`
- Kit pages must not import starter-only files
- Guest routes are public writes. Per-visitor limit, honeypot, length caps, and refuse when the host gives no IP. Never trust a visitor id from the request: derive it from the request's IP on the server
- The collection must have comments enabled for the idea page to show them. The kit's collection definition turns them on, and the page must cope when the owner turns them off
