# Changelog

Versions match `package.json`, the git tag and the registry release. Newest first.

## [Unreleased]

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
