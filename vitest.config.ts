import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	test: {
		// Each test file boots a sandbox host that builds dist/; files in parallel can read a
		// half-written dist/manifest.json ("Unexpected end of JSON input"). One file at a time.
		fileParallelism: false,
		// Each test boots a real site in workerd; on a busy machine one can take tens of seconds.
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
