# Use cases

**Included in Free.** Product Roadmap has no paid version.

Here are five ways site owners use Product Roadmap. Each one says which settings to pick and what visitors then see. All settings are on **Roadmap**, then **Settings**, in admin.

## Show a public roadmap and let people vote

You want customers to see what you are working on and tell you what matters most.

1. Add one item for each thing you plan or build. Open the **Roadmap** content type, fill in **Title** and **Description**, pick a stage in the **Stage** panel, and publish.
2. Under **Who can take part**, set **Who can vote and suggest** to **Anyone** if you want the most votes. Choose **Signed-in members only** if you want one vote per real account.
3. Under **Stages**, rename the four stages to match how you talk. They start as Under review, Planned, In progress and Done.

Visitors open `/roadmap/` and see one column per stage. Each card has a **Vote** button and a count. They click once to vote and click again to take the vote back. Each person can vote on an item once. See [Voting](../using/voting.md).

Guests on a shared office address share one vote per item. If votes need to be exact, pick **Signed-in members only**.

## Collect ideas from customers, with your approval

You want ideas from customers, but you do not want strangers posting on your site.

1. Under **Who can take part**, leave **Allow suggestions** on.
2. Pick **Anyone** to hear from everybody, or **Signed-in members only** to hear only from people with an account.
3. Under **Email**, turn on **Email me when ideas are waiting** and fill in **Send that email to**. This needs a mail provider on the site.

Visitors choose **Suggest an idea** on the board and fill in a title, a description and their name. They see "Thanks. Your idea is waiting for review." Nothing goes live.

You open **Roadmap**, then **Ideas**. Choose **Decide**, then **Approve** to put the idea in your first stage, or **Reject** to keep it off the board. You also get a **Roadmap: waiting for you** card on the EmDash dashboard. See [Suggestions and the Ideas queue](../using/suggestions.md).

If two people suggest the same thing, merge the copy into the item you keep. Votes move across, one per person. See [Merge a duplicate](../using/merge-duplicates.md).

To stop taking ideas for a while, turn **Allow suggestions** off. The button leaves the board.

## Put a changelog in your menu

You want customers to see what you shipped, without writing a blog post each time.

1. Open the **Changelog** content type and add an entry with a **Title**, a **Summary** and a **Released** date.
2. Publish it.
3. In admin, open **Menus** and add a link to `/changelog/`.

Visitors open **Changelog** in your menu and see releases newest first, grouped by month. Each release has its own page. Always fill in the **Released** date, or the entry is filed under a plain "Changelog" heading. See [The changelog](../using/changelog.md).

The changelog does not link to roadmap items on its own. When an item ships, move it to your last stage and add a release note.

## Let customers talk about each item

You want customers to explain why an idea matters, and to answer each other.

1. Turn comments on for the **Roadmap** content type.
2. Moderate comments in EmDash's own comment screens.

Each item page at `/roadmap/<slug>/` shows the comments and a comment form. Each card on the board shows how many approved comments the item has. If comments are off, the item page says "Comments are closed on this site." See [Items and stages](../using/items-and-stages.md#comments).

The changelog has no comments.

## Sort a long board by category

Your board has grown, and customers want to see only their part of the product.

1. In admin, open the **Roadmap categories** list and add your categories, for example Billing or Mobile app.
2. Pick a category on each item before you publish it.

Visitors use the **Category** filter on the board and see only those items. They can also use **Sort** to choose **Most votes** or **Newest**. The choice sits in the address, for example `/roadmap/?sort=newest`, so they can share it. The board shows up to 100 items, so retire old ones as it grows. See [The board](../using/the-board.md).

## Next step

[Use it with posts and pages](posts-and-pages.md).
