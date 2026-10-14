# Install Product Roadmap

**Included in Free.** Product Roadmap has no paid version.

Installing takes three parts: the plugin in admin, the two content types it reads, and the site kit in your site's code. The last two need someone who can edit the site's files.

## Before you start

- Your site runs EmDash 1.2 or later.
- Your site loads plugins from the registry. In `astro.config.mjs`, EmDash needs a sandbox runner. Without one, EmDash skips sandboxed plugins when the site starts.
- You want the hourly email? The site also needs a mail provider. The official Resend plugin is the usual choice. Everything else works without mail.

## Step 1: install the plugin

1. In admin, open **Plugins**, then **Registry**.
2. Search for **Product Roadmap** and choose **Install**.
3. EmDash lists what the plugin asks for. Product Roadmap asks to read, write and publish your content, read your content types and categories, create redirects, and send email. It needs them to list items, save suggested ideas as drafts, publish an idea you approve, redirect a merged item, and send the hourly notice. Confirm the install.

A **Roadmap** group with **Ideas** and **Settings** now appears in the admin menu.

## Step 2: create the two content types

The plugin reads two content types: **roadmap** and **changelog**. The site kit's `seed/collection.mjs` file has their exact definitions. Create them in your site, or match the fields by hand.

| Content type | Fields | Notes |
| --- | --- | --- |
| roadmap | Title (required), Description, Stage | Turn comments on. Address pattern `/roadmap/{slug}`. Drafts must be on |
| changelog | Title (required), Summary, Released (date and time) | Address pattern `/changelog/{slug}` |

Also create a category list named `roadmap_category` (shown as **Roadmap categories**) and attach it to the roadmap content type. The board's Category filter reads it. Add your own categories in admin afterwards.

Check your work on the **Ideas** screen. The **Roadmap collection** and **Changelog collection** fields should both say **Ready**. If one says **Missing**, a banner tells you to create it.

## Step 3: copy the site kit

The kit is in the `site-kit/` folder of the [Product Roadmap repository](https://github.com/wbcomdesigns/emdash-roadmap), at the tag of the version you installed. From your site's root folder:

```bash
K=path/to/emdash-roadmap/site-kit

mkdir -p src/lib src/styles src/components src/layouts src/pages/roadmap src/pages/changelog
cp $K/lib/roadmap-*.ts src/lib/
cp $K/styles/roadmap.css src/styles/
cp $K/components/VoteButton.astro src/components/
cp $K/pages/roadmap/*.astro src/pages/roadmap/
cp $K/pages/changelog/*.astro src/pages/changelog/
[ -f src/layouts/RoadmapLayout.astro ] || cp $K/layouts/RoadmapLayout.astro src/layouts/
```

The last line copies the layout file only the first time, so a later update never overwrites your edits to it.

Two more files, `wbcom-kit.ts` and `wbcom-base.css`, are shared by every Wbcom plugin. If another Wbcom plugin already copied them, keep the newer copy. The first line of each file carries a number (`wbcom-shared: N`). Copy a file only when your site has no copy yet or a lower number, so another plugin's newer copy is never replaced. This short script does the check for you:

```bash
shared() { v="$(sed -n '1s/.*wbcom-shared: *\([0-9]*\).*/\1/p' "$1" 2>/dev/null)"; echo "${v:-0}"; }
newer() { [ ! -f "$2" ] || [ "$(shared "$1")" -ge "$(shared "$2")" ]; }
newer "$K/lib/wbcom-kit.ts" src/lib/wbcom-kit.ts && cp "$K/lib/wbcom-kit.ts" src/lib/wbcom-kit.ts
newer "$K/styles/wbcom-base.css" src/styles/wbcom-base.css && cp "$K/styles/wbcom-base.css" src/styles/wbcom-base.css
```

## Step 4: point the layout at your theme

Open `src/layouts/RoadmapLayout.astro`. It hands every roadmap page to your site's own layout and expects it at `src/layouts/Base.astro`. If your layout has another name or place, change the import on that one line.

## Step 5: add menu links

In admin, open **Menus** and add links to `/roadmap/` and `/changelog/`.

## Check it worked

1. Open `/roadmap/` on your site. You see the board with your stages as columns.
2. Open **Roadmap**, then **Settings**, in admin and check the settings. See the [Settings reference](../settings/settings-reference.md).

If the page is a 404 or the board says it could not load, see [Troubleshooting](../troubleshooting/troubleshooting.md).

## After you update the plugin

Copy the site kit again from the new version's tag. The kit and the plugin are released together, and an older kit may not reach a newer plugin.
