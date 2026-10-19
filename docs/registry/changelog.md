## 0.3.0

New permission: Read content revisions, so the Stage panel can see and move an item while it has unpublished changes. You approve it once when you update. Guests need a visitor address to vote. Copy the kit again after you update:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.3.0 \
    https://github.com/wbcomdesigns/emdash-roadmap \
    "$kit/emdash-roadmap" &&
  "$kit/emdash-roadmap/scripts/add-to-site.sh" .
```

- Security: no guest writes without a visitor address; one guest per IPv4 or IPv6 /64; guest hashes cleared after 30 days; guarded decisions.
- New: Set up visitor pages card; scripts/add-to-site.sh copies the whole kit.
- Improve: Stage panel is the one place to set the stage.
- Fix: Ideas counts, nested form, alignment, dark mode.

## 0.2.1

- Fix: the My votes file no longer has the same name as WB Polls', so both kits can sit on one site. Copy the kit again after updating.

## 0.2.0

- New: My votes page, Ideas stats, Find and paging on waiting ideas, and an optional Roadmap block for post text (trusted install).
- Security: server-side calls run inside EmDash with no web request. Copy the kit again after updating.

## 0.1.4

- Improve: one command creates the content types. Guides for use cases and blog posts and pages.
- Fix: a mistyped stage no longer hides an item; a member's vote always shows after reload; the Suggest form points at a missing name; readable with the site's light mode on a dark device.

## 0.1.3

- New: board cards show a short description, the category and the comment count; each stage shows how many items it has.
- New: the item page shows its category, with comments set apart from the vote button.
- Fix: approve never overwrites your edits; publish an edited idea from the editor and it leaves the Ideas list.
- Fix: new and approved ideas go to the first stage shown on the board.
- New: full user guides.

Older versions: https://github.com/wbcomdesigns/emdash-roadmap/blob/main/CHANGELOG.md
