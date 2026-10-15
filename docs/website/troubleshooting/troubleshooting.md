# Troubleshooting

**Included in Free.** Product Roadmap has no paid version.

## The /roadmap/ page is a 404

The plugin cannot create pages. Your developer must copy the site kit pages into the site, then rebuild. See [Install Product Roadmap](../getting-started/install.md).

## The board says "Could not load the board. Try again."

1. **Is the kit current?** After you update the plugin, copy the site kit again from the version you installed. An older kit may not reach a newer plugin.
2. **Is the plugin running?** Your site needs a sandbox runner in `astro.config.mjs`. Without one, EmDash skips sandboxed plugins when it starts.
3. **Is the content type there?** On **Ideas**, a banner appears only when the roadmap or changelog content type is missing. When both exist, the banner is gone.

## The board shows but is empty

1. **Is the item published?** Drafts stay off the board.
2. **Is its stage on the list and shown?** A stage you hid is not a column. A stage name that is not on your list shows in no column. Set the stage with the **Stage** panel.
3. **Did you just publish?** Changes can take a couple of minutes to reach visitors.
4. **More than 100 items?** The board shows up to 100.

## An approved idea is not on the board

New and approved ideas go to the first stage shown on the board. If an item still does not appear, open it in the content screens and check its Stage matches one of your stage names exactly.

## The Category filter only shows "All"

The category list `roadmap_category` is missing, empty, or not attached to the Roadmap content type. Create it and add categories. See [Install Product Roadmap](../getting-started/install.md#step-2-create-the-two-content-types).

## "Sign in to continue."

**Who can vote and suggest** is set to **Signed-in members only**, and the visitor is not signed in. They can use the **Sign in** link, or you can choose **Anyone** in **Settings**.

## "Too many requests. Try again in an hour."

One person sent more than 8 votes, or more than 8 ideas, in an hour. It clears by itself. Guests who share an internet address share the count.

## "Give a name."

A guest left **Your name** empty on the suggest form. Signed-in members do not need one.

## "Suggestions are closed right now."

**Allow suggestions** is off in **Settings**. Turn it on to reopen the form.

## "Could not send that from this browser. Try again."

Your hosting did not pass on the visitor's address, and the browser blocked the small code Product Roadmap uses instead. Ask the visitor to allow site data for your site, or choose **Signed-in members only**.

## A vote shows "Voted" on one browser and "Vote" on another

A guest's "Voted" mark is remembered in their own browser. The vote is still counted. Signed-in members see their mark on every device.

## A vote count looks too low

An item's page reads its count from the board. An item in a hidden stage, or beyond the first 100 items, can show 0 on its own page even though its votes are saved. Show the stage to fix it.

## I did not get the ideas email

All of these must be true:

1. **Email me when ideas are waiting** is on.
2. **Send that email to** holds a valid address.
3. At least one idea is waiting.
4. The site has a mail provider, such as the official Resend plugin.
5. An hour has passed since the last notice.

## "That idea is no longer waiting." or "That idea changed after this page loaded."

Someone else decided on or changed the idea. Reload **Ideas** and look again.

## A stage will not let me remove it

"This stage still has N items." Move them to another stage first. Drafts count too.

## "That item has unpublished edits."

You cannot change the stage of an item that has edits waiting. Publish or discard the edits, then move it.

## "This idea's draft has unpublished edits."

Someone edited the idea's draft after it was suggested. Open it in Roadmap content, check it, and publish it there. The idea then leaves the Ideas list by itself.

## Still stuck?

Gather your EmDash version, the Product Roadmap version, and the exact message you see, and contact [Wbcom Designs](https://wbcomdesigns.com).
