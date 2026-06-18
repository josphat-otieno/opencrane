import { Router } from "express";
import { AutoRoutingObjective, ModelRoutingScope, SkillModelMode } from "@opencrane/contracts";
import type { AutoRoutingConfig } from "@opencrane/contracts";
import { Prisma } from "@prisma/client";
import type { PrismaClient, Skill as PrismaSkill } from "@prisma/client";

import { _ClusterTenantScopeGuard } from "../infra/middleware/cluster-tenant-scope.js";
import type { ClusterTenantScopedResource } from "../infra/middleware/cluster-tenant-scope.types.js";
import type { SkillModelPostureView, SkillModelPostureWrite, ValidationFailure } from "./skill-model-posture.types.js";

/** The valid {@link AutoRoutingObjective} string values, used to validate an incoming config. */
const _VALID_OBJECTIVES: readonly string[] = Object.values(AutoRoutingObjective);

/**
 * Map a `Skill` row's identity to the ClusterTenant-scope guard's resource shape (AIR.0b). A skill
 * carries a free-text `scope` plus an owning `team`; a team-scoped skill is treated as owned by the
 * ClusterTenant named by its `team`, while a non-team (org/global) skill is Global — operator-only.
 *
 * @param scope - The skill's `scope` value.
 * @param team  - The skill's `team` value (empty string when not team-scoped).
 * @returns The scope + owning clusterTenant the guard compares against.
 */
function _toScopedResource(scope: string, team: string): ClusterTenantScopedResource
{
  const owningTeam = typeof team === "string" ? team.trim() : "";
  if (owningTeam)
  {
    return { scope: ModelRoutingScope.ClusterTenant, clusterTenant: owningTeam };
  }
  return { scope: ModelRoutingScope.Global, clusterTenant: null };
}

/**
 * Project a persisted `Skill` row into its posture read DTO. The posture columns are validated on
 * write, so the `autoConfig` JSON is returned verbatim on read.
 *
 * @param row - The persisted `Skill` row.
 * @returns The posture-view DTO (timestamps as ISO-8601 strings).
 */
function _toView(row: PrismaSkill): SkillModelPostureView
{
  return {
    name: row.name,
    scope: row.scope,
    team: row.team,
    path: row.path,
    modelMode: row.modelMode === "Pinned" ? SkillModelMode.Pinned : row.modelMode === "Auto" ? SkillModelMode.Auto : null,
    pinnedModel: row.pinnedModel,
    autoConfig: (row.autoConfig as AutoRoutingConfig | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a contract {@link SkillModelMode} to the Prisma enum value. */
function _toPrismaMode(mode: SkillModelMode): "Pinned" | "Auto"
{
  return mode === SkillModelMode.Pinned ? "Pinned" : "Auto";
}

/**
 * Validate the shape of an inbound {@link AutoRoutingConfig} (objective enum + required knobs).
 * Mirrors the model-routing-defaults validator so a skill's auto config and a scope default's auto
 * config are held to the same bar. Returns a failure envelope or null when acceptable.
 *
 * @param raw - The untrusted `autoConfig` value from the request body.
 * @returns A `{ error, code }` payload when invalid; null when valid.
 */
function _validateAutoConfig(raw: unknown): ValidationFailure | null
{
  // 1. Must be a plain object — anything else cannot carry the required config knobs.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
  {
    return { error: "autoConfig must be an object.", code: "VALIDATION_ERROR" };
  }

  const config = raw as Record<string, unknown>;

  // 2. The optimization objective is the one required closed enum on the config.
  if (typeof config.objective !== "string" || !_VALID_OBJECTIVES.includes(config.objective))
  {
    return { error: `autoConfig.objective must be one of: ${_VALID_OBJECTIVES.join(", ")}.`, code: "VALIDATION_ERROR" };
  }

  // 3. sessionPin and explorationRate are contract-required; enforce their types/range.
  if (typeof config.sessionPin !== "boolean")
  {
    return { error: "autoConfig.sessionPin must be a boolean.", code: "VALIDATION_ERROR" };
  }
  if (typeof config.explorationRate !== "number" || config.explorationRate < 0 || config.explorationRate > 1)
  {
    return { error: "autoConfig.explorationRate must be a number between 0 and 1.", code: "VALIDATION_ERROR" };
  }

  return null;
}

/**
 * Validate a {@link SkillModelPostureWrite} body. Enforces the posture invariants: `pinned`
 * requires a `pinnedModel`; `auto` requires a well-formed `autoConfig`; null clears the posture.
 *
 * @param body - The untrusted request body.
 * @returns A `{ error, code }` payload when invalid; null when valid.
 */
function _validateWrite(body: Record<string, unknown>): ValidationFailure | null
{
  const mode = body.modelMode;

  // 1. modelMode is the required selector; null is the explicit "clear posture / inherit" value.
  if (mode !== null && mode !== SkillModelMode.Pinned && mode !== SkillModelMode.Auto)
  {
    return { error: "modelMode must be 'pinned', 'auto', or null.", code: "VALIDATION_ERROR" };
  }

  // 2. A pinned posture is meaningless without the model it pins to.
  if (mode === SkillModelMode.Pinned && !(typeof body.pinnedModel === "string" && body.pinnedModel.trim()))
  {
    return { error: "pinnedModel is required when modelMode is 'pinned'.", code: "VALIDATION_ERROR" };
  }

  // 3. An auto posture must carry a well-formed config so the runtime optimizer (AIR.7) can trust it.
  if (mode === SkillModelMode.Auto)
  {
    const autoError = _validateAutoConfig(body.autoConfig);
    if (autoError)
    {
      return autoError;
    }
  }

  return null;
}

/**
 * Router for reading and setting a skill's model posture (Track AIR.3). The `Skill` model is keyed
 * by the compound `(name, scope, team)`, so the per-skill routes take all three as query params.
 *
 * Read (`GET /`, `GET /skill`) is open to any authenticated caller. The posture set (`PUT /skill`)
 * is gated by the ClusterTenant scope guard (AIR.0b): a team-scoped skill is owned by the
 * ClusterTenant named by its `team`; an org/global skill is operator-only.
 *
 * @param prisma - Prisma client used for persistence.
 * @returns Configured Express router.
 */
export function skillModelPostureRouter(prisma: PrismaClient): Router
{
  const router = Router();

  // Mutation guard: resolve the targeted skill's scope from the compound-key query params so the
  // guard can compare the owning team against the caller's resolved ClusterTenant.
  const guard = _ClusterTenantScopeGuard(prisma, async function _resolveResource(req): Promise<ClusterTenantScopedResource | null>
  {
    const scope = typeof req.query.scope === "string" ? req.query.scope : "";
    const team = typeof req.query.team === "string" ? req.query.team : "";
    return _toScopedResource(scope, team);
  });

  router.put("/skill", guard);

  /** List all skills with their model posture. */
  router.get("/", async function _listSkills(req, res)
  {
    const rows = await prisma.skill.findMany({ orderBy: [{ scope: "asc" }, { team: "asc" }, { name: "asc" }] });
    res.json(rows.map(_toView));
  });

  /** Get a single skill's posture by its compound key (name + scope + team). */
  router.get("/skill", async function _getSkill(req, res)
  {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "";
    const team = typeof req.query.team === "string" ? req.query.team : "";

    if (!name || !scope)
    {
      res.status(400).json({ error: "name and scope query params are required.", code: "VALIDATION_ERROR" });
      return;
    }

    const row = await prisma.skill.findUnique({ where: { name_scope_team: { name, scope, team } } });
    if (!row)
    {
      res.status(404).json({ error: "Skill not found", code: "SKILL_NOT_FOUND" });
      return;
    }
    res.json(_toView(row));
  });

  /** Set (or clear) a skill's model posture, keyed by its compound key. */
  router.put("/skill", async function _setSkillPosture(req, res)
  {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const scope = typeof req.query.scope === "string" ? req.query.scope : "";
    const team = typeof req.query.team === "string" ? req.query.team : "";

    if (!name || !scope)
    {
      res.status(400).json({ error: "name and scope query params are required.", code: "VALIDATION_ERROR" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    // 1. Validate the posture body before touching the row.
    const error = _validateWrite(body);
    if (error)
    {
      res.status(400).json(error);
      return;
    }

    // 2. The skill must already exist — posture is set on a catalogued skill, not created here.
    const existing = await prisma.skill.findUnique({ where: { name_scope_team: { name, scope, team } } });
    if (!existing)
    {
      res.status(404).json({ error: "Skill not found", code: "SKILL_NOT_FOUND" });
      return;
    }

    const write = body as unknown as SkillModelPostureWrite;

    // 3. Normalise the posture columns by mode: pinned keeps the model and clears auto; auto keeps
    //    the config (Prisma.JsonNull when absent) and clears the pin; null clears everything.
    const isPinned = write.modelMode === SkillModelMode.Pinned;
    const isAuto = write.modelMode === SkillModelMode.Auto;
    const autoConfigValue: Prisma.InputJsonValue | typeof Prisma.JsonNull = isAuto && write.autoConfig
      ? (write.autoConfig as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    // 4. Persist the posture transition.
    const updated = await prisma.skill.update({
      where: { name_scope_team: { name, scope, team } },
      data: {
        modelMode: write.modelMode ? _toPrismaMode(write.modelMode) : null,
        pinnedModel: isPinned ? write.pinnedModel!.trim() : null,
        autoConfig: autoConfigValue,
      },
    });
    res.json(_toView(updated));
  });

  return router;
}
