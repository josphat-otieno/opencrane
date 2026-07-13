import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest resolves the `@opencrane/*` workspace aliases straight from
 * tsconfig.frontend.json — this lib has no build step of its own.
 *
 * `environment: "node"` + the shared Angular-compiler setup file keeps specs
 * that reach into Angular DI (TestBed, router, etc.) working without jsdom.
 */
export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["../../../../../tsconfig.frontend.json"] })],
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["../../../vitest.frontend.setup.ts"],
		passWithNoTests: true
	}
});
