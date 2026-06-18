import type { Command } from "commander";

import type { AutoRoutingConfig, paths } from "@opencrane/contracts";

import type { CliConfig } from "../config.js";
import { _MakeClient } from "../config.js";
import { _Print, _PrintApiError, type OutputFormat } from "../format.js";

/**
 * Create/update body for a skill's model posture. Derived from the generated
 * client `paths` because the contract has no hand-written export for it.
 */
type SkillModelPostureWrite =
  paths["/skills/posture/skill"]["put"]["requestBody"]["content"]["application/json"];

/** Columns shown for `oc skill-posture list` in table mode. */
const _LIST_COLUMNS = ["name", "scope", "team", "path", "modelMode", "pinnedModel", "autoConfig"];

/** Flag values for `oc skill-posture show`. */
interface _SkillPostureShowOptions
{
  /** Skill name (part of the compound key). */
  name: string;
  /** Skill scope (part of the compound key). */
  scope: string;
  /** Owning team (part of the compound key). */
  team: string;
  /** Output format. */
  output: OutputFormat;
}

/** Flag values for `oc skill-posture set`. */
interface _SkillPostureSetOptions
{
  /** Skill name (part of the compound key). */
  name: string;
  /** Skill scope (part of the compound key). */
  scope: string;
  /** Owning team (part of the compound key). */
  team: string;
  /** Posture mode: pinned | auto. */
  mode: string;
  /** Pinned model publicModelName, required when --mode pinned. */
  pinnedModel?: string;
  /** Auto-routing config as a JSON string (parsed with JSON.parse). */
  autoConfig?: string;
  /** Output format. */
  output: OutputFormat;
}

/**
 * Parse an `--auto-config <json>` flag into an AutoRoutingConfig.
 * Exits cleanly on malformed JSON so the caller never sees a raw exception.
 */
function _parseAutoConfig(raw: string): AutoRoutingConfig
{
  try
  {
    return JSON.parse(raw) as AutoRoutingConfig;
  }
  catch (err)
  {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`error: --auto-config is not valid JSON — ${msg}`);
    process.exit(1);
  }
}

/** Register all `oc skill-posture *` sub-commands on the given parent Command. */
export function _RegisterSkillPosture(parent: Command, getConfig: () => CliConfig): void
{
  const skillPosture = parent
    .command("skill-posture")
    .description("Manage per-skill model posture — pinned vs auto model selection (list, show, set)");

  skillPosture
    .command("list")
    .description("List all skills with their model posture")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: { output: OutputFormat })
    {
      const client = _MakeClient(getConfig());
      const { data, error } = await client.GET("/skills/posture");
      if (error) _PrintApiError("skill-posture list", error);
      _Print(data, opts.output, _LIST_COLUMNS);
    });

  skillPosture
    .command("show")
    .description("Show a single skill's model posture by its compound key")
    .requiredOption("--name <name>", "Skill name")
    .requiredOption("--scope <scope>", "Skill scope, e.g. org|team|personal")
    .requiredOption("--team <team>", "Owning team (empty string when not team-scoped)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _show(opts: _SkillPostureShowOptions)
    {
      const client = _MakeClient(getConfig());
      const { data, error } = await client.GET("/skills/posture/skill", {
        params: { query: { name: opts.name, scope: opts.scope, team: opts.team } },
      });
      if (error) _PrintApiError("skill-posture show", error);
      _Print(data, opts.output);
    });

  skillPosture
    .command("set")
    .description("Set a skill's model posture (pinned requires --pinned-model; auto validates --auto-config)")
    .requiredOption("--name <name>", "Skill name")
    .requiredOption("--scope <scope>", "Skill scope, e.g. org|team|personal")
    .requiredOption("--team <team>", "Owning team (empty string when not team-scoped)")
    .requiredOption("--mode <mode>", "Posture mode: pinned|auto")
    .option("--pinned-model <publicModelName>", "Pinned model's public slug (when --mode pinned)")
    .option("--auto-config <json>", "Auto-routing config as a JSON object string (when --mode auto)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _set(opts: _SkillPostureSetOptions)
    {
      // 1. Assemble the typed write body from the supplied flags. The mode
      //    string is passed through so the API stays the single validator.
      const body: SkillModelPostureWrite = {
        modelMode: opts.mode as SkillModelPostureWrite["modelMode"],
        ...(opts.pinnedModel ? { pinnedModel: opts.pinnedModel } : {}),
        ...(opts.autoConfig ? { autoConfig: _parseAutoConfig(opts.autoConfig) } : {}),
      };

      // 2. PUT through the set path with the name/scope/team query params.
      const client = _MakeClient(getConfig());
      const { data, error } = await client.PUT("/skills/posture/skill", {
        params: { query: { name: opts.name, scope: opts.scope, team: opts.team } },
        body,
      });
      if (error) _PrintApiError("skill-posture set", error);
      _Print(data, opts.output);
    });
}
