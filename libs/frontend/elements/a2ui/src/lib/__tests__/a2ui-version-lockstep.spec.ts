import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Repo-root `package.json` — resolved from this file's own location (not
 * `process.cwd()`), since Nx runs this lib's `test` target with the lib
 * directory as cwd, not the workspace root.
 */
const _ROOT_PACKAGE_JSON = fileURLToPath(new URL("../../../../../../../package.json", import.meta.url));

/**
 * §5 version discipline (fast, offline CI guard): our A2UI packages must move in lockstep with
 * the `@a2ui/lit` minor OpenClaw ships at the pinned render-tree tag. The AUTHORITATIVE upstream
 * cross-check (fetching @a2ui/lit at the tag) lives in scripts/sync-render-tree.sh and runs on a
 * pin bump; this test is the cheap invariant every CI run enforces:
 *   - @a2ui/angular and @a2ui/web_core share one minor, and
 *   - that minor equals EXPECTED_A2UI_MINOR (kept in step with the pin by the sync script).
 * If you bump the OpenClaw pin and @a2ui/lit's minor changes, update the @a2ui/* deps AND this.
 */
const EXPECTED_A2UI_MINOR = "0.10"; // OpenClaw @a2ui/lit @ v2026.6.11

/** The `major.minor` of a semver-ish range string (strips a leading ^ or ~). */
function _minor(range: string): string
{
	return range.replace(/^[^0-9]*/, "").split(".").slice(0, 2).join(".");
}

describe("A2UI version lockstep (#41 §5)", () =>
{
	const pkg = JSON.parse(readFileSync(_ROOT_PACKAGE_JSON, "utf8")) as { dependencies?: Record<string, string> };
	const deps = pkg.dependencies ?? {};

	it("declares both @a2ui packages", () =>
	{
		expect(deps["@a2ui/angular"], "@a2ui/angular missing from dependencies").toBeTruthy();
		expect(deps["@a2ui/web_core"], "@a2ui/web_core missing from dependencies").toBeTruthy();
	});

	it("keeps @a2ui/angular + @a2ui/web_core on the same minor as the pinned @a2ui/lit", () =>
	{
		expect(_minor(deps["@a2ui/angular"]!)).toBe(EXPECTED_A2UI_MINOR);
		expect(_minor(deps["@a2ui/web_core"]!)).toBe(EXPECTED_A2UI_MINOR);
	});
});
