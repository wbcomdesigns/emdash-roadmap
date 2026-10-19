// Writes site-kit/kit.sums and site-kit/lib/roadmap-strings.sums: the SHA-256 of every kit file
// scripts/add-to-site.sh copies, at every released tag plus the working tree, keyed by the path
// it gets on a site. add-to-site.sh backs up a site file only when its hash is not listed for its
// path, so an untouched file from any release is replaced without a word.
// Run after any kit change and before tagging: node scripts/make-kit-sums.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const repo = new URL("..", import.meta.url).pathname;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "buffer", maxBuffer: 64 << 20 });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Kit folder to site folder. Shared Wbcom files follow their own version rule; the layout is
// never overwritten. Neither is listed.
const PARTS = { lib: "src/lib", styles: "src/styles", components: "src/components", pages: "src/pages", blocks: "src/roadmap-block" };
const SKIP = new Set(["wbcom-kit.ts", "wbcom-base.css", ".gitkeep", "roadmap-strings.sums"]);

export function sitePath(kitPath) {
	const [, part, ...rest] = kitPath.split("/");
	if (!PARTS[part] || SKIP.has(rest.at(-1))) return null;
	return `${PARTS[part]}/${rest.join("/")}`;
}

const lines = new Set();
const strings = [];
const tags = git("tag", "--list", "v*", "--sort=v:refname").toString().split("\n").filter(Boolean);
for (const tag of tags) {
	const files = git("ls-tree", "-r", "--name-only", tag, "site-kit").toString().split("\n").filter(Boolean);
	for (const file of files) {
		const site = sitePath(file);
		if (!site) continue;
		const hash = sha(git("show", `${tag}:${file}`));
		lines.add(`${hash}  ${site}`);
		if (site === "src/lib/roadmap-strings.ts" && !strings.includes(hash)) strings.push(hash);
	}
}
const walk = (dir) =>
	readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
for (const full of walk(join(repo, "site-kit"))) {
	const site = sitePath(relative(repo, full));
	if (!site) continue;
	const hash = sha(readFileSync(full));
	lines.add(`${hash}  ${site}`);
	if (site === "src/lib/roadmap-strings.ts") {
		const at = strings.indexOf(hash);
		if (at !== -1) strings.splice(at, 1);
		strings.push(hash);
	}
}
writeFileSync(join(repo, "site-kit/kit.sums"), `${[...lines].sort((a, b) => a.slice(66).localeCompare(b.slice(66)) || a.localeCompare(b)).join("\n")}\n`);
writeFileSync(join(repo, "site-kit/lib/roadmap-strings.sums"), `${strings.join("\n")}\n`);
console.log(`Wrote site-kit/kit.sums (${lines.size} lines) and site-kit/lib/roadmap-strings.sums (${strings.length})`);
