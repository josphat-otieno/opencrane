import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { _PackageCacheDir } from "../../../../vitest.cache.js";

export default defineConfig({
	cacheDir: _PackageCacheDir(import.meta.url),
	plugins: [tsconfigPaths({ projects: ["../../../../tsconfig.vitest.json"] })],
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["../../vitest.frontend.setup.ts"],
		passWithNoTests: true
	}
});
