**Why is `/roadmap/` a 404 after install?**
The plugin cannot create pages. Run the kit command from the Installation tab (or from Admin, Roadmap, Ideas) with the tag of the version you installed, then restart the dev server.

**The board says it could not load.**
Copy the kit again from the tag of the version you installed. The kit and the plugin are released together.

**Can guests vote and suggest ideas?**
Yes, when Settings is set to Anyone (the default) and the host gives EmDash the visitor's address: Cloudflare, or `trustedProxyHeaders` in the site config. Otherwise guests see a sign-in link and Settings says so. Every idea waits for your approval.

**A guest sees a 401 in the browser console.**
Expected: the page checks a signed-in member's votes first. The page is fine.

**How do I move an item to another stage?**
On the item's edit screen, use the Stage panel on the right.

**Do new ideas go live straight away?**
No. A suggestion is saved as a draft. Approve it on Ideas to put it on the board.

**What happens if I rename a stage?**
The board uses the new name. Items stay in that column. You do not need to edit each item.

**Does it work in dark mode?**
Yes. The kit colours follow your site theme.

**Does it send email?**
One short notice an hour when ideas are waiting, if the site has a mail provider. The notice has no idea text and no link. The dashboard card always shows the count.

**Is there a paid version?**
No. Everything here is free.
