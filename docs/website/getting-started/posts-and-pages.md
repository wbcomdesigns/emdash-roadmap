# Posts and pages

**Included in Free.** Product Roadmap has no paid version.

Product Roadmap brings its own pages. They sit next to your blog posts and pages, and you link between them. This guide assumes the standard EmDash blog template (`npm create emdash@latest -- --template blog`).

## The pages it adds

| Page | Address |
| --- | --- |
| The board | `/roadmap/` |
| One roadmap item | `/roadmap/<slug>/` |
| Suggest an idea | `/roadmap/suggest/` |
| The changelog | `/changelog/` |
| One release | `/changelog/<slug>/` |

Your posts stay at `/posts/<slug>` and your pages at `/pages/<slug>`. Nothing about them changes.

## Add the pages to your menu

1. In admin, open **Menus**.
2. Add a link named **Roadmap** that points to `/roadmap/`.
3. Add a link named **Changelog** that points to `/changelog/`.

The site menu then shows both. The board also has its own **Suggest an idea** and **Changelog** buttons, so you do not need menu links for those.

## Link to an item from a post or page

Use a normal link. In the post or page editor, select the words, add a link, and paste the item's address.

For example, a post about a new feature can say "Vote for it on [our roadmap](/roadmap/)". To point at one item, use `/roadmap/<slug>/`. You find the slug in the Roadmap content type, on the item.

Link to a release the same way, with `/changelog/<slug>/`.

The item page has its own **Vote** button and comments, so visitors can vote and talk right there.

## No block for posts

The site kit has one component, `VoteButton`. It belongs to the item pages. It needs a roadmap item's id, not a post's id, so it is not a way to add roadmap content inside `src/pages/posts/[slug].astro` or `src/pages/pages/[slug].astro`.

Roadmap content lives on its own pages and you link to it from your posts. Comments on a post stay EmDash's normal post comments. They are separate from the comments on roadmap items.

## Next step

[Use cases](use-cases.md).
