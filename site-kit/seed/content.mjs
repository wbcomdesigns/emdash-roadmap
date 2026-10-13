const item = (id, slug, title, stage, category, description) => ({
	id,
	slug,
	status: "published",
	data: { title, description, stage },
	taxonomies: { roadmap_category: [category] },
});

const release = (id, slug, title, released, summary) => ({
	id,
	slug,
	status: "published",
	data: { title, summary, released },
});

export const roadmapItems = [
	item(
		"roadmap-dark-board",
		"dark-mode-for-the-board",
		"Dark mode for the board",
		"Under review",
		"core",
		"The board should follow the site theme, including when the visitor prefers a dark screen.",
	),
	item(
		"roadmap-guest-vote",
		"guest-voting",
		"Guest voting",
		"Under review",
		"core",
		"Let a visitor vote without an account, one vote per visitor per item.",
	),
	item(
		"roadmap-filter-category",
		"filter-by-category",
		"Filter by category",
		"Under review",
		"core",
		"A visitor should be able to show one category at a time on the board.",
	),
	item(
		"roadmap-sort-votes",
		"sort-by-most-votes",
		"Sort by most votes",
		"Planned",
		"core",
		"Let people sort the board by most votes or by newest.",
	),
	item(
		"roadmap-suggest-form",
		"suggest-an-idea",
		"Suggest an idea",
		"Planned",
		"core",
		"A short form so people can send an idea. It waits for approval.",
	),
	item(
		"roadmap-mobile-tabs",
		"board-on-a-phone",
		"Board on a phone",
		"Planned",
		"mobile",
		"On a small screen, show one stage at a time as tabs instead of four columns.",
	),
	item(
		"roadmap-item-page",
		"item-page-with-comments",
		"Item page with comments",
		"In progress",
		"core",
		"Each item gets its own page with the description, a vote button, and the site's comments.",
	),
	item(
		"roadmap-changelog-page",
		"changelog-list",
		"Changelog list",
		"In progress",
		"docs",
		"A list of releases, newest first, grouped by month.",
	),
	item(
		"roadmap-public-board",
		"public-board",
		"Public board",
		"Done",
		"core",
		"A public board with a column for each stage and a vote count on every card.",
	),
	item(
		"roadmap-setup-guide",
		"setup-guide",
		"Setup guide",
		"Done",
		"docs",
		"A short developer guide for copying the kit and creating the two collections.",
	),
];

export const changelogEntries = [
	release(
		"changelog-0-1-0",
		"0-1-0",
		"0.1.0",
		"2026-10-01T00:00:00.000Z",
		"First public board, voting, and a place to send ideas.",
	),
	release(
		"changelog-0-1-1",
		"0-1-1",
		"0.1.1",
		"2026-10-04T00:00:00.000Z",
		"Guest voting and a clearer empty state on each column.",
	),
	release(
		"changelog-0-2-0",
		"0-2-0",
		"0.2.0",
		"2026-10-08T00:00:00.000Z",
		"Filter by category and sort by most votes or newest.",
	),
	release(
		"changelog-0-3-0",
		"0-3-0",
		"0.3.0",
		"2026-10-12T00:00:00.000Z",
		"Comments on an item page, using the site's own comments.",
	),
];
