## 0.4.0

Every page, vote and admin screen now stays within Cloudflare's limit of 10 requests per plugin call on a busy test site. Cloudflare stays marked not supported until it is checked there. No new permission.

- New: each item keeps a running vote count; counts from 0.3.0 are rebuilt on Ideas page loads and hourly.
- Improve: merge, Roadmap votes erase and the hourly cleanup run in steps.
- Fix: on Cloudflare a guest vote was refused as "not on the board".
- Fix: the kit script no longer claims the content types were created on a Cloudflare site.

Copy the kit again after you update. Until then, a category-filtered board shows every item and Take back all my votes stops with an error after 7.

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.4.0 \
    https://github.com/wbcomdesigns/emdash-roadmap \
    "$kit/emdash-roadmap" &&
  "$kit/emdash-roadmap/scripts/add-to-site.sh" .
```

## 0.3.0

New permission: Read retained content revision history, so the Stage panel can see and move an item while it has unpublished changes. You approve it once when you update. Guests need a visitor address to vote. Copy the kit again after you update:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.3.0 \
    https://github.com/wbcomdesigns/emdash-roadmap \
    "$kit/emdash-roadmap" &&
  "$kit/emdash-roadmap/scripts/add-to-site.sh" .
```

- New: Set up visitor pages card; scripts/add-to-site.sh copies the whole kit.
- Improve: Stage panel is the one place to set the stage.
- Fix: Ideas counts, nested form, alignment, dark mode.
- Security: no guest writes without a visitor address; one guest per IPv4 or IPv6 /64; hashes cleared after 30 days.

## 0.2.1

- Fix: the My votes file no longer has the same name as WB Polls', so both kits can sit on one site. Copy the kit again after updating.

Older versions: https://github.com/wbcomdesigns/emdash-roadmap/blob/main/CHANGELOG.md
