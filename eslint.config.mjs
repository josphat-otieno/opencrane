/**
 * Root ESLint flat config — module-boundary enforcement only.
 *
 * Mechanical TypeScript style stays in `scripts/agent-style-check.sh` and per-package
 * `tsc --noEmit`; this config exists solely so the NX project graph can enforce the
 * scope tags declared in each package.json (`nx.tags`):
 *
 *   - `scope:shared`  (libs/* infra + contracts) may only depend on other shared libs.
 *   - `scope:backend` (libs/backend/*)           may depend on backend + shared libs.
 *   - `scope:web`     (libs/frontend/*)          may depend on web + shared libs.
 *   - `scope:app`     (apps/*)                   may depend on anything.
 *
 * Run via `pnpm lint:boundaries`.
 */
import nx from "@nx/eslint-plugin";
import tsEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".claude/**",
      ".nx/**",
      "website/**",
      "libs/contracts/src/generated/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: { parser: tsParser },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    // typescript-eslint is registered ONLY so pre-existing inline
    // `eslint-disable @typescript-eslint/*` directives resolve; no rules enabled.
    plugins: { "@nx": nx, "@typescript-eslint": tsEslint },
    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            { sourceTag: "scope:shared", onlyDependOnLibsWithTags: ["scope:shared"] },
            { sourceTag: "scope:backend", onlyDependOnLibsWithTags: ["scope:backend", "scope:shared"] },
            { sourceTag: "scope:web", onlyDependOnLibsWithTags: ["scope:web", "scope:shared"] },
            { sourceTag: "scope:app", onlyDependOnLibsWithTags: ["*"] },
          ],
        },
      ],
    },
  },
];
