## 0.4.1

Guests keep their 0.3.0 votes on sites that move to EmDash 1.5. No new permission.

- Fix: install keeps a 0.3.0 site's guest key, so guests can take back earlier votes.
- Fix: a setup error is logged instead of switching the plugin off on EmDash 1.5.
- Compat: tested on EmDash 1.2, 1.3 and 1.5.0.

Copy the kit with tag v0.4.1 after you update (same files as 0.4.0).

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

Older versions: https://github.com/wbcomdesigns/emdash-roadmap/blob/main/CHANGELOG.md
