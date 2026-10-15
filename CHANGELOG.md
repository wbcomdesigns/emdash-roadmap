# Changelog

Versions match `package.json`, the git tag and the registry release. Newest first.

## [Unreleased]

- Ideas shows how many ideas are waiting, how many items are in each stage, and votes this week. The ready content-type fields stay hidden. A banner appears only when a content type is missing.
- Waiting ideas have a find box and show 25 at a time.
- Merge a duplicate sits in its own section. You search by title, and the confirm step names both items.
- Settings is three tabs. Each stage still has its own form, plus Add a stage. Renaming a stage keeps its items on the board.
- A signed-in member can open My votes, see the items they voted for, and take every vote back with a second click. Only that member's votes are removed, and the counts update.
- Optional Roadmap block for post text. It is trusted site code. It shows the board for the page it sits on, and visitors can vote from it. It inserts with one fixed choice.
- Security - shared kit file updated: server-side plugin calls run inside EmDash with no web request.
- Security - the board and Suggest page check whether ideas are open inside EmDash itself, with no web request, so a visitor can never make the site call another address.

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
