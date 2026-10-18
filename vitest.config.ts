import { emdashPluginTest } from "@emdash-cms/plugin-test/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [emdashPluginTest()],
	// Each test boots a real site in workerd; on a busy machine one can pass 5 seconds.
	test: { testTimeout: 20_000 },
});
