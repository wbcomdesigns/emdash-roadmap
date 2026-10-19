# Voting

**Included in Free.** Product Roadmap has no paid version.

Visitors vote with the **Vote** button on a board card or on an item's page. One person gets one vote per item.

## What a visitor does

1. Choose **Vote**. The button changes to **Voted** and the count goes up.
2. Choose **Voted** to take the vote back. The count goes down.

The count updates in place, with no page reload. Screen readers hear the button as a toggle with the item's title and count.

## Who can vote

Set by **Who can vote and suggest** in **Settings**:

| Setting | Guests | Signed-in members |
| --- | --- | --- |
| Anyone (default) | Can vote | Can vote |
| Signed-in members only | See "Sign in to continue." with a **Sign in** link | Can vote |

A signed-in member always votes as themselves, whichever setting you pick.

## How a guest vote is counted

A guest has no account, so Product Roadmap counts one vote per internet address (for IPv6, per /64 network, so one home's rotating addresses count once). It stores only a salted, scrambled form of the address, never the address itself, and clears even that from a vote after 30 days. The vote stays.

Your hosting has to tell EmDash the visitor's address: Cloudflare does, and any other host does once the site sets `trustedProxyHeaders` (see [Install](../getting-started/install.md#guests-and-the-visitor-address)). Without it, guests cannot vote or suggest: they see "Sign in to vote or suggest on this site." with a **Sign in** link, and members take part as usual.

What this means for you:

- People who share one internet address, such as one office, share one vote per item.
- After 30 days a guest is forgotten on purpose: the vote stays, but it no longer carries their address. The same guest can then vote on that item again, and can no longer take the old vote back (the button says so and goes back to **Vote**). This trades a little precision for privacy. For votes where that matters, choose **Signed-in members only**.
- A guest's "Voted" mark comes from their own browser. On a different browser they see **Vote**, though their vote still counts.

## Roadmap votes

A signed-in member opens `/account/roadmap-votes/`. Each item is a link, with its stage in plain words. Ideas they sent are listed with a status: waiting for a decision, on the board, or not published. **Take back all my votes** asks for a second click. Guests see a sign-in link. Add a menu link labelled **Roadmap votes** (WB Polls uses My votes for its own page).

## Limits

- Only published items can be voted on.
- Each person can cast up to 8 votes an hour, across all items. Taking a vote back does not count. Past the limit they see "Too many requests. Try again in an hour."
- Merging two items moves votes across and keeps one per person. See [Merge a duplicate](merge-duplicates.md).
- Votes live apart from the content, so voting never changes an item or republishes it.

## Next step

[Suggestions and the Ideas queue](suggestions.md).
