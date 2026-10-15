import { definePlugin } from "emdash";

/**
 * The roadmap board inside a post. One fixed choice, so it inserts without a list or a typed id.
 * The page reads the current entry itself. This plugin has no route and does not fetch.
 */
export function createPlugin() {
	return definePlugin({
		id: "roadmap-block",
		version: "1.0.0",
		admin: {
			portableTextBlocks: [
				{
					type: "roadmapBoard",
					label: "Roadmap",
					description: "The roadmap board. Visitors can vote from it.",
					fields: [
						{
							type: "select",
							action_id: "show",
							label: "What to show",
							initial_value: "board",
							options: [{ label: "The board", value: "board" }],
						},
					],
				},
			],
		},
	});
}

export default createPlugin;
