# Roadmap and Feature Voting: scope

**Status: LOCKED on 2026-10-13.** Scope and decisions were agreed with the owner. An agent does not add options or features. If a task cannot be done as written, stop, say why on its issue, and wait for the owner.

This file is the contract for the plugin. Code, tests, docs and cards all follow it. If something here is wrong, change it here first, in the same pull request as the code.

## Corrections after reading EmDash's own guides (2026-10-13)

**This section wins over any older line below that disagrees with it.**

- **Comments are EmDash's own.** `Comments` and `CommentForm` from `emdash/ui/comments`, with `commentsEnabled: true` on the roadmap collection. Moderation happens in EmDash's comment admin. Nothing of ours.
- **Categories are EmDash's own taxonomy.** The typed product label is gone.
- **Merging a duplicate** uses EmDash redirects (`redirects:write`) so the old address lands on the kept item.
- **Owner alert:** a card on the EmDash dashboard (`admin.widgets`) shows what is waiting and links to it. That is the alert on every site. The hourly email is an extra, sent only where the site has mail; the setup guide names the official Resend plugin.
- **Visitors first:** a visitor is never locked out by hosting. Trusted visitor address where EmDash supplies it, browser cookie otherwise, written content always approved first.
- **Member account list (`<My...>`):** not in 0.1.0. Moved to 0.2.0. The erase-by-person function stays, as an admin action.
- **Block inside post text:** only with a trusted install. The registry install is the whole product without it.
- **Admin pages:** Ideas (waiting list, merge), Settings (suggestions on or off, who can take part, stages, email), plus the dashboard card.
- **Changelog** is a normal EmDash collection with a list page and a page per release. No plugin logic.

## Purpose

Show customers what is planned, let signed-in members vote and suggest ideas, and let the owner decide what moves forward. A changelog shows what shipped.

**Who it is for:** Product companies, plugin and theme shops, SaaS and open source projects.

**WordPress source:** Product Roadmap (`~/dev/repos/product-roadmap`, manifest at `audit/manifest.json`) for scope and wording. Its admin has Roadmap, Changelog, Products, Dashboard and Settings. Do not copy PHP.

**Brand:** Product Roadmap, indigo. Full kit (mark, wordmark, horizontal, square, each in light, dark and white, plus PNGs and social banners) and the brand sheet: `~/Documents/brand logos/product-roadmap/`. `icon.png` and `images/banner.png` in this repo come from it. Rebuild with the pipeline in `~/Documents/brand logos/_render-src/`, never by hand. The lockup tagline names WordPress, so use the mark and the no-tagline lockup on EmDash.

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
- Every visitor-facing word is in one wording file, so a non-English site or a site with its own vocabulary changes it in one place

**Decided by the owner on 2026-10-13: the site owner chooses who can take part.** One setting: signed-in members only, or anyone. For a guest: one entry per visitor, identified by a salted hash of the IP (never the IP itself, never a cookie the visitor can clear to vote again within the hour limit), an hourly limit per visitor, a honeypot field on every guest form, and written content always held for approval. Guests have no account, so they have no "My ..." list and cannot erase their entries themselves; the owner removes them in admin. If the host supplies no trusted visitor address, fall back to a browser cookie (one entry per browser), keep written content waiting for approval, and say on the admin page that protection is weaker on this hosting. A visitor is never locked out by hosting (owner direction 2026-10-13: visitors first, about nine in ten EmDash sites have visitors only). Member routes stay private routes using `routeCtx.user`. Guest routes are separate public routes: never merge the two paths.

## Decisions made with the owner

Settled. Do not reopen these in code review. Dated 2026-10-13 unless noted.

| Question | Decision |
| --- | --- |
| Who can take part | The site owner chooses: signed-in members only, or anyone. Default is anyone. |
| Discussion on an idea | Yes, using EmDash's own comments on the idea page. The plugin builds no comment system. |
| Wording and language | One wording file per plugin kit. Every visitor-facing phrase lives there, so an owner can translate or reword the plugin by editing one file. |
| Who suggests ideas | Anyone, with a name, always with approval. A switch turns suggestions off. |
| Layout | Board with a column per stage. |
| Stages | The admin adds, removes, renames and reorders them, and can hide a stage from the board. Replaces "four fixed". |
| Emails | Only to the admin: one an hour when ideas are waiting. No emails to voters. |
| Duplicate ideas | Merge into an existing item. Votes move, one per person. |
| Changelog | List page plus a page per release. |
| Categories and sort | EmDash categories on roadmap items. Visitors filter by category and sort by Most votes or Newest. |
| Member pieces | My votes moves to 0.2.0. EmDash is not member-focused for now. |
| Setup and long lists | Developer guide plus one command. Next, Previous and find in admin. |

## Against the free WordPress plugin (Product Roadmap), checked 2026-10-13

| Free WordPress feature | Here |
| --- | --- |
| Public roadmap, voting by members or guests, "Voted" state | Yes |
| Suggestions with approval and spam protection | Yes, and open to guests (paid on WordPress) |
| Comments on items | Yes, EmDash's own comments |
| Custom statuses | Yes |
| Categories, filter and sort | Yes |
| Changelog with list and release pages | Yes |
| Emails to voters and commenters on a status change | No, by owner decision: admin notice only for now |
| Follows the site's colours and dark mode | Yes |
| Layout | Board with columns (paid on WordPress; the free layout there is a list) |

Extra, not in WordPress: merging duplicate ideas. Paid WordPress features stay out: several roadmaps, timeline and card layouts, analytics, advanced filters, feedback button, digests, webhooks, custom fields.

## In scope for 0.1.0

- Roadmap items live in an EmDash collection (`roadmap`): title, description, stage. Categories are an EmDash taxonomy on that collection
- Stages managed by the admin (start: Under review, Planned, In progress, Done). A stage can be hidden from the board
- Public board: one column per stage, with a filter by category and a sort choice (Most votes, Newest)
- Item page with description, status and vote button
- One vote per member per item. Click again to take it back
- Members suggest an idea: it is created as a draft and waits in the admin queue
- Admin: ideas queue (approve publishes it as Under review, reject), settings
- Changelog: a second collection (`changelog`) with a kit page. No plugin logic
- Merge a duplicate idea into an existing item
- Changelog: list page and a page per release
- One email an hour to the admin when ideas are waiting
- Setting "Who can take part": signed-in members only, or anyone. A guest gets one vote per visitor per item, and can suggest an idea with a display name. Ideas always wait for approval
- Idea pages show EmDash's own comment list and form, with EmDash's moderation
- One wording file, `site-kit/lib/roadmap-strings.ts`: every phrase a visitor can see (buttons, labels, messages, empty states, errors shown to visitors). Components and pages take their text only from it

## Out of scope

Do not build these. If a card seems to need one, stop and ask the owner.

- Notifying voters when status changes
- `<MyVotes>` and any member account list (0.2.0)
- Private boards
- Multiple boards
- Importing from other tools
- Any paid or Pro feature
- Email to anyone but the site admin
- Portable Text blocks or anything that needs a native plugin
- Injecting scripts, styles or HTML into pages from the plugin
- A comment system of our own
- Translating the admin screens, and switching language per visitor. The wording file holds one language

## Roles

| Role | Can do |
| --- | --- |
| Guest | Everything marked `public` in the routes table |
| Member | Signed in at subscriber role or above. Everything marked `member`, acting only on their own data |
| Admin | Everything marked `admin`, from the EmDash admin |

## Capabilities

`content:read`, `content:write`, `content:publish` (an approved idea becomes a published item), `taxonomies:read` (categories on the board), `redirects:write` (merge), `email:send` (the hourly notice to the site admin)

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
| `stages` | json | Under review, Planned, In progress, Done | The list of stages: name, order, shown on the board or hidden. Managed on the Settings page |
| `notify` | boolean | `true` | Email the site admin when ideas are waiting, at most once an hour |
| `notify_to` | string | site admin | Where that email goes |
| `collection` | string | `roadmap` | Collection that holds the items. Internal: never shown on the Settings page |
| `who` | string | `anyone` | `members` or `anyone` |

## Routes

Base: `/_emdash/api/plugins/roadmap/<name>`.

| Route | Who | Methods | Input | Returns |
| --- | --- | --- | --- | --- |
| `health` | public | GET | - | `ok`, version, whether the collection exists |
| `board` | public | GET | `category` (optional), `sort` (`votes` or `newest`) | Published items grouped by status with vote counts. 100 items max |
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
| `/ideas` | Stats and the pending ideas table with full text and Approve / Reject. Items themselves are edited in the EmDash content admin |
| `/settings` | Allow suggestions, who can take part, stages, and the hourly admin email. The internal collection name is never shown |
| Dashboard card | Count of ideas waiting, with a link to `/ideas` |

## Site kit

| File | What it is |
| --- | --- |
| `site-kit/seed/collection.mjs` | `roadmap` and `changelog` collections |
| `site-kit/pages/roadmap/index.astro` | The board |
| `site-kit/pages/roadmap/[slug].astro` | Item page. Mounts EmDash `Comments` and `CommentForm` |
| `site-kit/pages/roadmap/suggest.astro` | Idea form |
| `site-kit/pages/changelog/index.astro` | Changelog |
| `site-kit/components/VoteButton.astro` | `<VoteButton id />` |
| `site-kit/styles/roadmap.css` | Board columns and cards |
| `site-kit/lib/roadmap-strings.ts` | The wording file. The only place visitor-facing text is written |

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
- Messages that come back from a route (for example a refusal) reach the visitor too. Routes return a stable `code`; the kit maps codes to phrases from the wording file and never prints the route's own English message
