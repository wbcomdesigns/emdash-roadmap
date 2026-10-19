# Frequently asked questions

**Included in Free.** Product Roadmap has no paid version.

## Can guests vote and suggest ideas?

Yes, when **Who can vote and suggest** is **Anyone** (the default) and your hosting tells EmDash the visitor's address: Cloudflare, or `trustedProxyHeaders` in the site config. Without that address guests see a sign-in link and Settings says so. Guests add a name on the suggest form, and every idea waits for your approval.

## Can a visitor vote twice on the same item?

Not on purpose. A signed-in member has one vote per item. A guest is counted by their internet address (one per IPv6 /64). After 30 days the address is cleared from the vote, so the same guest could vote again. For votes where that matters, choose **Signed-in members only**.

## Do ideas go live straight away?

No. A suggestion is saved as a draft and appears in **Ideas**. Approve it to put it on the board.

## Can I get a message when an idea arrives?

Yes. The EmDash dashboard shows a **Roadmap: waiting for you** card. If your site has a mail provider, you can also turn on a short email, at most once an hour. See the [Settings reference](../settings/settings-reference.md#email).

## Do voters get an email when an item moves to a new stage?

No. This version sends email only to you.

## What happens if I rename a stage?

The board uses the new name and the items stay in that column. You do not edit each item.

## Can I hide a stage?

Yes. Turn off **Show on the board** for it in **Settings**. Its items are off the board, but their own pages still open for anyone with the address.

## Can I have more than one board?

No. One board per site.

## Can visitors discuss an idea?

Yes. Each item page uses EmDash's own comments, moderated in EmDash. Turn comments off on the Roadmap content type and the page says "Comments are closed on this site."

## Do I need member accounts?

No. With **Anyone** selected, guests can vote and suggest, as long as your hosting gives EmDash the visitor's address. Member accounts matter only if you choose **Signed-in members only**.

## Does it work in dark mode and on phones?

Yes. The board follows the visitor's light or dark setting. On a phone it shows one stage at a time as tabs.

## Can I translate it?

The words visitors read, yes: edit the wording file. The admin screens stay in English. See [Wording and look](../customize/wording-and-look.md).

## Does it work with other Wbcom plugins?

Yes. Use it alone or with any of them. They share two small kit files, so keep the newer copy.

## Is there a paid version?

No. Everything described in these guides is free.
