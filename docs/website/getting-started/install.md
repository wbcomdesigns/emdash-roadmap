# Install Product Roadmap

**Included in Free.** Product Roadmap has no paid version.

## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare:** add `import { sandbox } from "@emdash-cms/cloudflare";` and `sandboxRunner: sandbox(),`. It needs the Workers Paid plan and a `worker_loaders` binding named `LOADER` in your Wrangler config. The EmDash Cloudflare templates ship that binding commented out. EmDash's guide: https://docs.emdashcms.com/deployment/plugin-sandbox/#cloudflare-workers

Stop the dev server and start it again. **Registry** now shows in the admin menu.

**2. The plugin is the engine. Visitor pages come from its site kit.** A registry plugin cannot add pages to your site. Until you copy the kit, its addresses (for example `/roadmap/`) show your site's 404 page. That is expected. The kit copy below takes one command.

**3. You need Node 22.16 or later** for the `npx emdash seed` step.

Checked on EmDash 1.3.0 with the `blog` template on Node. The Cloudflare lines follow EmDash's own guide; we have not run them on a Cloudflare site yet.

## Install

1. Admin, Registry, search **Product Roadmap**, Install, then accept the permissions.
2. From your site's root folder, get the kit for the version you just installed and copy it in:

   ```bash
   kit="$(mktemp -d)" && git clone --branch v0.2.2 --depth 1 https://github.com/wbcomdesigns/emdash-roadmap "$kit/emdash-roadmap" && "$kit/emdash-roadmap/scripts/add-to-site.sh" .
   ```

   (`mktemp -d` makes a fresh folder only you can write to, and `&&` runs the script only when the clone worked. Never clone into a fixed `/tmp/<name>`: on a shared machine someone else can create it first.)

   The script copies the kit, never replaces a newer shared file another Wbcom plugin already copied, keeps a backup of any wording file you changed, creates the content types the plugin needs (if any), and prints the exact lines to paste into your templates, with the file names.
3. Paste the lines it printed. Restart the dev server.
4. Add the menu links it printed in Admin, Menus.
5. Open the plugin in the admin and follow its first screen.

After every plugin update, run step 2 again with the new tag.

## What the permissions are for

Product Roadmap asks to read, write and publish your content, read your content types and categories, create redirects, and send email. It needs them to list items, save suggested ideas as drafts, publish an idea you approve, redirect a merged item, and send the hourly notice.

After the install, a **Roadmap** group with **Ideas** and **Settings** appears in the admin menu.

## What the script does on your site

| Part | Where it goes |
| --- | --- |
| Pages | `src/pages/roadmap/` (board, one item, suggest an idea), `src/pages/changelog/`, `src/pages/account/roadmap-votes.astro` (My votes) |
| Kit files | `src/lib/`, `src/styles/`, `src/components/`, including the two shared Wbcom files |
| Wording | `src/lib/roadmap-strings.ts`. If yours differs from the release, your copy is kept as `roadmap-strings.ts.bak-YYYYMMDD` and the script says so |
| Layout | `src/layouts/RoadmapLayout.astro`, copied only the first time. Later runs never overwrite it |
| Content types | `.emdash/roadmap-seed.json`, then `npx emdash seed .emdash/roadmap-seed.json --no-content` (Node 22.16 or later). It creates the **roadmap** and **changelog** content types and the **Roadmap categories** taxonomy, and leaves anything you already have alone. It never changes your menus |
| Optional block | `src/roadmap-block/`, unused until you add it to `astro.config.mjs` (see below) |

**Templates:** nothing to paste. The kit brings its own pages, so the script says so instead of printing lines.

**Menus:** in Admin, Menus, add `/roadmap/` (Roadmap), `/changelog/` (Changelog) and `/account/roadmap-votes/` (My votes). WB Polls has its own My votes at `/account/votes`; both pages work side by side.

If the seed step could not run (an older Node, or a database that is not `./data.db`), run it yourself from the site root with Node 22.16 or later: `npx emdash seed .emdash/roadmap-seed.json --no-content`, adding `-d <file>` for another database file.

**Layout:** `src/layouts/RoadmapLayout.astro` hands every roadmap page to `src/layouts/Base.astro`, the blog template's layout. If your layout has another name or place, change the import on that one line.

## Check it worked

1. Open `/roadmap/`. You see the board with your stages as columns, lined up with your site's header.
2. Open Admin, Roadmap, **Ideas**. When both content types exist you see **Ideas waiting**, a count for each stage and **Votes this week**. Press **Visitor pages are set up** on the card at the top.
3. Open Admin, Roadmap, **Settings**: who can take part, stages, and the hourly email. See the [Settings reference](../settings/settings-reference.md).

**Expected in the browser console:** a guest on `/roadmap/`, an item page or `/account/roadmap-votes/` gets one `401` from the plugin's `votes` address. That is the check for a signed-in member's votes; the page is fine. On a site where the plugin was installed from local files rather than the registry, you also see one `404` the first time a page asks the plugin anything (the kit tries the registry address first).

If a page is a 404 or the board says it could not load, see [Troubleshooting](../troubleshooting/troubleshooting.md).

## Guests and the visitor address

Guests can vote and suggest only when your host tells EmDash the visitor's address. EmDash fills it in on Cloudflare (EmDash's own docs; not yet run by us on Cloudflare). On any other host, add `trustedProxyHeaders` to `emdash({ ... })` in `astro.config.mjs`, naming the header your proxy sets, for example `trustedProxyHeaders: ["x-forwarded-for"],`. Only do this when the site really sits behind a proxy that sets that header, or visitors could make up their own address.

Without it, guests see a sign-in link instead of the vote result and the suggest form, members take part as usual, and Admin, Roadmap, Settings says that guests cannot take part on this host.

## Move an item to another stage

Open the item in Admin, Content, Roadmap, and use the **Stage** panel on the right: one button per stage. The board changes at once and the item's Stage box in the form follows. If the item has unpublished edits, publish or discard them first; the panel says so.

## The in-text block (optional)

The registry plugin works without it. It needs a trusted install of the block code, which the script already copied to `src/roadmap-block/`. In `astro.config.mjs`:

```js
import { roadmapBlock } from "./src/roadmap-block/descriptor.mjs";

emdash({
	plugins: [roadmapBlock()],
	// sandboxed: [roadmap] stays as it is
});
```

Restart the site. In a post or page, type `/roadmap` and choose **Roadmap**. The block shows the board, and visitors can vote from it.

## After you update the plugin

Run step 2 of Install again with the new version's tag. The kit and the plugin are released together, and an older kit may not reach a newer plugin. Your `RoadmapLayout.astro` is kept, and a changed wording file is backed up first.
