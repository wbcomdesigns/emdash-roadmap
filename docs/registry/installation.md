## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare:** add `import { sandbox } from "@emdash-cms/cloudflare";` and `sandboxRunner: sandbox(),`. It needs the Workers Paid plan, the `worker_loaders` binding named `LOADER` (uncomment it in your Wrangler config) and an R2 bucket as `storage: r2(...)`, or the install stops with "Storage error while installing plugin". Then run `npm run deploy`.

Stop the dev server and start it again. **Registry** now shows in the admin menu.

**2. The plugin is the engine. Visitor pages come from its site kit.** A registry plugin cannot add pages to your site. Until you copy the kit, its addresses (for example `/roadmap/`) show your site's 404 page. That is expected. The kit copy below takes one command.

**3. You need Node 22.16 or later** for the `npx emdash seed` step.

Checked on EmDash 1.3.1 with the `blog` template, on Node and on Cloudflare Workers (registry install).

## Install

1. Admin, Registry, search **Product Roadmap**, Install, then accept the permissions.
2. From your site's root folder:

   ```bash
   kit="$(mktemp -d)" &&
     git clone --depth 1 \
       --branch v0.4.0 \
       https://github.com/wbcomdesigns/emdash-roadmap \
       "$kit/emdash-roadmap" &&
     "$kit/emdash-roadmap/scripts/add-to-site.sh" .
   ```

3. Nothing to paste. Restart the dev server.
4. Add the printed links in Admin, Menus.
5. Open Admin, Roadmap, Ideas.

After every update, run step 2 with the new tag. Full guide: https://github.com/wbcomdesigns/emdash-roadmap/blob/v0.4.0/docs/website/getting-started/install.md
