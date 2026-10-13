// Adds this plugin to the lab site: a file: dependency and an entry in the sandboxed list.
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { labAstroConfig, labRoot, pluginIdentity, pluginRoot } from "./paths.mjs";

const plugin = pluginRoot();
const lab = labRoot();
const { name, slug } = pluginIdentity(plugin);
const local = slug.replace(/[^a-zA-Z0-9]/g, "_");
const configPath = labAstroConfig(lab);
if (!configPath) throw new Error(`No astro.config in ${lab}. Run scripts/setup-lab.sh first.`);

const pkgPath = resolve(lab, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies ||= {};
pkg.dependencies[name] = `file:${relative(lab, plugin) || "."}`;
pkg.dependencies["@emdash-cms/sandbox-workerd"] ||= "^0.9.3";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);

let config = readFileSync(configPath, "utf8");
if (!config.includes(name)) {
	if (!/from ["']emdash\/astro["']/.test(config)) {
		throw new Error(`${configPath} does not import emdash/astro. This is not an EmDash site.`);
	}
	config = config.replace(/(from ["']emdash\/astro["'];?\n)/, `$1import ${local} from "${name}";\n`);
	if (/sandboxed:\s*\[/.test(config)) {
		config = config.replace(/sandboxed:\s*\[/, (hit) => `${hit}${local}, `);
	} else if (config.includes("sandboxRunner")) {
		config = config.replace(/sandboxRunner:[^\n]+/, (line) => `${line}\n\t\t\tsandboxed: [${local}],`);
	} else {
		if (!/emdash\(\s*\{/.test(config)) throw new Error(`${configPath} has no emdash({ ... }) block to patch.`);
		config = config.replace(
			/emdash\(\s*\{/,
			`emdash({\n\t\t\tsandboxed: [${local}],\n\t\t\tsandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",`,
		);
	}
	writeFileSync(configPath, config);
}
console.log(`Wired ${name} into ${lab}`);
