export const STAGE_OPTIONS = ["Under review", "Planned", "In progress", "Done"];

export const roadmapCollection = {
	slug: "roadmap",
	label: "Roadmap",
	labelSingular: "Roadmap item",
	description: "Public roadmap items people can vote on",
	icon: "map",
	urlPattern: "/roadmap/{slug}",
	supports: ["drafts", "revisions", "preview", "seo"],
	commentsEnabled: true,
	admin: { listColumns: ["stage"] },
	fields: [
		{ slug: "title", label: "Title", type: "string", required: true, searchable: true },
		{ slug: "description", label: "Description", type: "text", searchable: true },
		{
			slug: "stage",
			label: "Stage",
			type: "string",
			indexed: true,
			defaultValue: "Under review",
		},
	],
};

export const changelogCollection = {
	slug: "changelog",
	label: "Changelog",
	labelSingular: "Release",
	description: "What shipped",
	icon: "list",
	urlPattern: "/changelog/{slug}",
	supports: ["drafts", "revisions", "seo"],
	fields: [
		{ slug: "title", label: "Title", type: "string", required: true, searchable: true },
		{ slug: "summary", label: "Summary", type: "text", searchable: true },
		{ slug: "released", label: "Released", type: "datetime" },
	],
};

export const roadmapTaxonomies = [
	{
		name: "roadmap_category",
		label: "Categories",
		labelSingular: "Category",
		hierarchical: true,
		collections: ["roadmap"],
		terms: [
			{ slug: "core", label: "Core" },
			{ slug: "mobile", label: "Mobile" },
			{ slug: "docs", label: "Docs" },
		],
	},
];

export const roadmapMenuItems = [
	{ type: "custom", label: "Roadmap", url: "/roadmap" },
	{ type: "custom", label: "Changelog", url: "/changelog" },
];
