import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function pluginRoot() {
	return resolve(process.env.PLUGIN_ROOT || resolve(here, ".."));
}

/** npm package name and registry slug, read from the plugin itself. */
export function pluginIdentity(root = pluginRoot()) {
	const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
	const manifest = readFileSync(resolve(root, "emdash-plugin.jsonc"), "utf8");
	const slug = /"slug"\s*:\s*"([^"]+)"/.exec(manifest)?.[1];
	if (!slug) throw new Error("No slug in emdash-plugin.jsonc");
	return { name: pkg.name, slug, port: Number(pkg.lab?.port) || 4321 };
}

/** Each plugin has its own lab site and port, so several can be worked on at once. */
export function labRoot() {
	const root = pluginRoot();
	return resolve(process.env.PLUGIN_LAB || resolve(root, "..", `emdash-lab-${pluginIdentity(root).slug}`));
}

export function labAstroConfig(lab = labRoot()) {
	for (const name of ["astro.config.mjs", "astro.config.ts", "astro.config.js"]) {
		const file = resolve(lab, name);
		if (existsSync(file)) return file;
	}
	return "";
}
