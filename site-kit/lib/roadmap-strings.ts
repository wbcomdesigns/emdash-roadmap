/** Every phrase a visitor can see. A site that wants its own words edits this file. */

export const strings = {
	boardTitle: "Roadmap",
	boardIntro: "What we are considering, building, and have shipped.",
	loading: "Loading the board.",
	loadError: "Could not load the board. Try again.",
	needsJs: "The roadmap needs JavaScript to show items.",
	sortVotes: "Most votes",
	sortNewest: "Newest",
	allCategories: "All",
	columnEmpty: "Nothing in this stage yet.",
	vote: "Vote",
	voted: "Voted",
	signIn: "Sign in",
	errors: {
		SIGN_IN_REQUIRED: "Sign in to vote.",
		NOT_FOUND: "That item is not on the board.",
		RATE_LIMITED: "Too many requests. Try again in an hour.",
		FAILED: "Something went wrong. Try again.",
		OFFLINE: "Could not reach the site. Check your connection.",
	} as Record<string, string>,
};

export function phrase(code: string | undefined): string {
	return (code && strings.errors[code]) || strings.errors.FAILED;
}
