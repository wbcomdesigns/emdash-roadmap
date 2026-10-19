# Changelog

Versions match `package.json`, the git tag and the registry release. Newest first.

## [0.3.0] - 2026-10-19

New permission: Read retained content revision history, so the Stage panel can see and move an item while it has unpublished changes. You approve it once when you update. Guests can now vote and suggest only when your host tells EmDash the visitor's address. Copy the kit again after you update:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.3.0 \
    https://github.com/wbcomdesigns/emdash-roadmap \
    "$kit/emdash-roadmap" &&
  "$kit/emdash-roadmap/scripts/add-to-site.sh" .
```

- New      - Ideas opens with a Set up visitor pages card that gives the kit command for the installed version, with a way to show it again later.
- New      - One command copies the whole kit into a site, layout included, and creates the content types: scripts/add-to-site.sh.
- Improve  - The Stage panel is the one place to move an item: one button per stage. A form opened before a move cannot undo it; a different stage typed in the Stage box is kept, and retyping a stage the panel just replaced is refused with a message.
- Improve  - A move on an item with unpublished changes goes into those changes, so nothing unreviewed goes live.
- Improve  - On a host with no visitor address, guests see the sign-in line up front, and Settings says so when no guest request in a day came with an address.
- Improve  - Any kit file you edited yourself is backed up before an update replaces it, and the script says when it upgrades a shared Wbcom file.
- Improve  - The member votes page and menu label are now Roadmap votes, so they sit apart from WB Polls' My votes.
- Fix      - Ideas no longer counts a waiting idea in Under review, and counts an item with an unknown stage in the first column like the board.
- Fix      - Taking back a vote that is no longer there says why (already taken back, or a guest vote older than 30 days), instead of showing Voted.
- Fix      - The Stage panel no longer puts a form inside the editor's form.
- Fix      - Roadmap pages line up with the site header and footer on the blog template at every width.
- Fix      - Buttons and selected chips use the theme's own brand colours, readable in dark mode (shared kit styles 4).
- Security - Guest votes and suggestions are refused when the host gives EmDash no visitor address (any host but Cloudflare, unless the site sets trustedProxyHeaders), and guests see a sign-in link instead.
- Security - A guest is one guest per IPv4 address or IPv6 /64, IPv4 written as IPv6 counts as the same guest, and a browser-sent code no longer counts as a guest.
- Security - After 30 days the hourly task clears the salted visitor hash from guest votes and ideas; the vote stays, and the guest may vote again.
- Security - Approve, reject, merge and the cleanup use guarded writes, and every merge checks that the item has not changed since the page loaded.
- Dev      - Minor version: new capability content:revisions:read.
- Compat   - Checked on EmDash 1.3.1. The 0.3.0 kit works with the 0.2.1 engine, and the 0.2.1 kit shows its sign-in line on the 0.3.0 engine.

## [0.2.1] - 2026-10-15

Copy the kit again after you update.

- Fix      - The My votes component is now `RoadmapVotes.astro`. Its old name was the same as WB Polls' My votes, so copying one kit replaced the other plugin's file.

## [0.2.0] - 2026-10-15

Copy the kit again after you update.

- New      - My votes: a signed-in member sees the items they voted for and the ideas they sent, and can take every vote back with a second click.
- New      - Ideas opens with how many ideas are waiting, how many items are in each stage, and votes this week.
- New      - Optional Roadmap block for post text. It is trusted site code and shows the board, with voting, inside the article.
- Improve  - Waiting ideas have Find and show 25 at a time. Merge a duplicate searches by title and names both items before it runs.
- Improve  - Settings is three tabs. Each stage keeps its own form, and renaming a stage keeps its items on the board.
- Security - The board and Suggest page check whether ideas are open inside EmDash, with no web request. Shared kit 5.

## [0.1.4] - 2026-10-14

Copy `site-kit/` again after you update.

- One command creates the roadmap and changelog content types: `npx emdash seed <kit>/seed/roadmap-seed.json --no-content`. It never changes your menus.
- An item whose stage was mistyped in the content form shows in the first column instead of disappearing from the board.
- A signed-in member's own vote always shows as theirs after a reload: vote buttons wait for the member's votes, and a failed lookup is retried once.
- The Suggest form says the name is needed when you are not signed in, and puts the cursor in the name field if it was left empty.
- The board follows the site's light or dark choice (shared kit styles), so it stays readable when a visitor picks light mode on a device set to dark.
- Guides: use cases, and how to use the roadmap with blog posts and pages.

## [0.1.3] - 2026-10-14

- Board cards show the first 120 characters of the description, the category and the comment count, and each stage shows how many items it has.
- The item page shows its category, and the comments sit apart from the vote button.
- Approving an idea never overwrites edits to its draft. An edited draft is published from the content editor, and the idea then leaves the Ideas list.
- Settings keeps at least one stage on the board.
- New and approved ideas go to the first stage shown on the board, so a hidden first stage no longer hides them.
- User guides for site owners in docs/website.

## [0.1.2] - 2026-10-14

- When suggestions are off, the board hides Suggest an idea and the suggest page shows only the closed message.
- Merge a duplicate starts with Choose an item, then names both items before the owner confirms.
- Board filters are labelled Category and Sort. Suggest is a primary button. The current phone stage tab is marked.

## [0.1.1] - 2026-10-14

Fixes from the first registry install and the all-plugins site test.

- The kit reaches the plugin on a registry install. It asks at the generated plugin id, then at the slug, and remembers which one answered.
- Shared kit files match the starter (`wbcom-shared` numbers), so one site can run several Wbcom plugins without the last copy overwriting a newer shared file.
- Board, item and suggest pages have their own max width and side padding.
- After you vote, a reload no longer shows "Voted 0". The count is fetched fresh for a visitor who has voted, and a voted button never shows zero.
- The vote button's accessible name includes the count.
- The taxonomy is named Roadmap categories, so it does not clash with EmDash Categories.
- On a roadmap item, Stage is a list of the stages you named, not a typed field.
- Settings no longer talks about a collection name staying internal.
- Registry name, banner and icon all say Product Roadmap. The banner is 3000 by 1000. Screenshots are from a styled site.

## [0.1.0] - 2026-10-14

First release for the EmDash registry.

- Public board with owner-managed stages, category filter and sort.
- Member and guest voting, one vote per person. Click again to take it back.
- Suggest an idea. It waits in Ideas until the owner approves or rejects it.
- Merge a duplicate. Votes move across, one per person.
- Item page with EmDash comments, suggest page, changelog list and release page.
- Hourly admin email when ideas are waiting, plus a dashboard card.
- Renaming a stage keeps the items that still store the old name.
