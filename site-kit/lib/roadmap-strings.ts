/** Every phrase a visitor can see. A site that wants its own words edits this file. */

export const strings = {
	boardTitle: "Roadmap",
	boardIntro: "What we are considering, building, and have shipped.",
	suggestLink: "Suggest an idea",
	changelogLink: "Changelog",
	filterCategory: "Category",
	filterSort: "Sort",
	loading: "Loading the board.",
	loadError: "Could not load the board. Try again.",
	needsJs: "The roadmap needs JavaScript to show items.",
	sortVotes: "Most votes",
	sortNewest: "Newest",
	allCategories: "All",
	columnEmpty: "Nothing in this stage yet.",
	vote: "Vote",
	voted: "Voted",
	voteCountOne: "1 vote",
	voteCountMany: "{n} votes",
	signIn: "Sign in",
	backToBoard: "Back to the roadmap",
	itemMissingTitle: "This idea is not here",
	itemMissingHint: "It may have moved, or it is still waiting for review.",
	commentsClosed: "Comments are closed on this site.",
	commentCount: (n: number) => (n === 1 ? "1 comment" : `${n} comments`),
	suggestTitle: "Suggest an idea",
	suggestIntro: "Describe the idea in a few words. It waits for review before it appears on the board.",
	suggestName: "Your name",
	suggestNameHint: "Needed if you are not signed in. Shown with your idea.",
	suggestTitleLabel: "Title",
	suggestBodyLabel: "Description",
	suggestSubmit: "Send idea",
	suggestThanks: "Thanks. Your idea is waiting for review.",
	suggestClosed: "Suggestions are closed right now.",
	suggestBusy: "Sending.",
	honeypot: "Leave this blank",
	changelogTitle: "Changelog",
	changelogIntro: "What shipped, newest first.",
	changelogEmpty: "No releases yet.",
	changelogEmptyHint: "Releases appear here once they are published.",
	releaseMissingTitle: "This release is not here",
	releaseMissingHint: "It may have moved. Open the changelog for what has shipped.",
	backToChangelog: "Back to the changelog",
	errors: {
		SIGN_IN_REQUIRED: "Sign in to continue.",
		MEMBERS_ONLY: "Sign in to continue.",
		NOT_FOUND: "That item is not on the board.",
		RATE_LIMITED: "Too many requests. Try again in an hour.",
		IDEAS_CLOSED: "Suggestions are closed right now.",
		INVALID: "Check the form and try again.",
		NAME_REQUIRED: "Give a name.",
		NO_VISITOR: "Could not send that from this browser. Try again.",
		SPAM: "That request was not accepted.",
		FAILED: "Something went wrong. Try again.",
		OFFLINE: "Could not reach the site. Check your connection.",
	} as Record<string, string>,
};

export function phrase(code: string | undefined): string {
	return (code && strings.errors[code]) || strings.errors.FAILED;
}

export function voteCountLabel(count: number): string {
	const n = Math.max(0, Math.round(Number(count) || 0));
	return n === 1 ? strings.voteCountOne : strings.voteCountMany.replace("{n}", String(n));
}
