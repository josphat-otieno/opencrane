import type { ToolEntry } from "./tools-markdown.types.js";

/**
 * Header re-stamped at the top of every generated `TOOLS.md`. States that the
 * file is platform-managed so neither the tenant nor the agent treats their own
 * edits as durable — the contract re-pull loop overwrites it when entitlements change.
 */
const _PREAMBLE = [
  "# TOOLS",
  "",
  "> Managed by OpenCrane — generated from this tenant's effective contract.",
  "> Edits are overwritten whenever entitlements change. Do not hand-edit.",
].join("\n");

/**
 * Render one tool list section (`## <title>`) as a markdown bullet list, sorted by
 * name for deterministic output. Falls back to an explicit "none" line when empty so
 * the agent can tell "nothing entitled" apart from "section missing".
 *
 * @param title   - Section heading (without the `##`).
 * @param entries - Entitled tools to list.
 * @param emptyNote - Italic line emitted when `entries` is empty.
 * @returns The rendered section as a markdown string.
 */
function _renderSection(title: string, entries: ToolEntry[], emptyNote: string): string
{
  // 1. Empty section — emit the heading plus an explicit "none" note so the absence
  //    is unambiguous to the agent rather than looking like a truncated file.
  if (entries.length === 0)
  {
    return `## ${title}\n\n_${emptyNote}_`;
  }

  // 2. Sort by name so the same entitlement set always renders byte-identically —
  //    the entrypoint diffs TOOLS.md by content, so non-deterministic order would
  //    cause spurious rewrites + SIGHUP reloads.
  const sorted = [...entries].sort(function _byName(a, b) { return a.name.localeCompare(b.name); });

  // 3. One bullet per tool; append the description only when present.
  const lines = sorted.map(function _bullet(entry)
  {
    const description = entry.description.trim();
    return description.length > 0 ? `- **${entry.name}** — ${description}` : `- **${entry.name}**`;
  });

  return `## ${title}\n\n${lines.join("\n")}`;
}

/**
 * The org-memory section, emitted when Cognee is wired for the fleet. Describes the
 * always-available local `memory_search` tool so the contract-derived TOOLS.md keeps
 * the agent aware of its org memory — otherwise the poll loop's regenerated doc would
 * silently drop the section the static L0 template carries.
 */
const _ORG_MEMORY_SECTION = [
  "## Org memory (Cognee)",
  "",
  "- **memory_search** — retrieve organisational memory (company documents, prior decisions, " +
    "project facts) from the Cognee knowledge graph. A local, in-pod tool that queries Cognee " +
    "directly (not via the Obot gateway), so it is always available. Results are scope-aware, " +
    "permission-filtered, and every one carries a citation. Prefer it over personal MEMORY.md " +
    "for org-wide facts.",
  "- **memory_remember** — persist a generalizable learning back to org memory (`content`, " +
    "`title`, `scope`, optional `subject`/`sensitivityTags`). Use for durable org/domain facts " +
    "other agents would want — NOT personal style, this user's preferences, or transient task " +
    "state (those stay in MEMORY.md). Remembered facts are attributed to you.",
].join("\n");

/** Options controlling optional sections of the generated `TOOLS.md`. */
export interface RenderToolsOptions
{
  /** Emit the org-memory (`memory_search`) section — set when Cognee is wired for the fleet. */
  orgMemory?: boolean;
}

/**
 * Render the tenant's `TOOLS.md` workspace doc from its entitled MCP servers and
 * skills. Pure and deterministic: identical inputs always produce identical output
 * so the in-pod content diff only fires on a real entitlement change.
 *
 * @param servers - Entitled MCP servers (allow-decided by the grant compiler).
 * @param skills  - Entitled skill bundles (allow-decided by the grant compiler).
 * @param options - Optional sections (e.g. org memory when Cognee is wired).
 * @returns The full `TOOLS.md` markdown document.
 */
export function _RenderToolsMarkdown(servers: ToolEntry[], skills: ToolEntry[], options: RenderToolsOptions = {}): string
{
  // 1. MCP servers the agent may reach through the Obot gateway (allow-decided).
  const mcpSection = _renderSection("MCP servers", servers, "No MCP servers are currently entitled.");

  // 2. Skills mounted into the agent workspace.
  const skillsSection = _renderSection("Skills", skills, "No skills are currently entitled.");

  // 3. Org memory (local memory_search tool) — only when Cognee is wired for the fleet.
  const orgMemorySection = options.orgMemory ? `\n\n${_ORG_MEMORY_SECTION}` : "";

  // 4. Assemble with a trailing newline so POSIX tools (and git) treat it as a text file.
  return `${_PREAMBLE}\n\n${mcpSection}\n\n${skillsSection}${orgMemorySection}\n`;
}
