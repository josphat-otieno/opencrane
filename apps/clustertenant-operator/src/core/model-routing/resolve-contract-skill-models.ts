import type { AutoRoutingConfig, SkillModelMode } from "@opencrane/contracts";
import { SkillModelMode as SkillModelModeEnum } from "@opencrane/contracts";
import type { PrismaClient } from "@prisma/client";

import { _ResolveSkillModel } from "./resolve-skill-model.js";
import type { ScopeDefaultModel, ScopeDefaults } from "./resolve-skill-model.types.js";
import type { ResolvedSkillModel } from "./resolve-contract-skill-models.types.js";

/** A `Skill` row's identity (name) plus its model-posture columns, as loaded for a contract. */
interface SkillPostureRow
{
  /** Skill name — joins back to the entitled skill bundle by name. */
  name: string;
  /** Posture mode column (Prisma enum string `Pinned`/`Auto`, or null). */
  modelMode: string | null;
  /** Pinned model `publicModelName`, when pinned. */
  pinnedModel: string | null;
  /** Auto-routing config JSON, when auto. */
  autoConfig: unknown;
}

/** Map a Prisma `SkillModelMode` enum string to the contract union, or null. */
function _toContractMode(mode: string | null): SkillModelMode | null
{
  if (mode === "Pinned")
  {
    return SkillModelModeEnum.Pinned;
  }
  if (mode === "Auto")
  {
    return SkillModelModeEnum.Auto;
  }
  return null;
}

/** Project a persisted `ModelRoutingDefault` row into the pure resolver's {@link ScopeDefaultModel}. */
function _toScopeDefault(row: { defaultModel: string | null; autoConfig: unknown } | null): ScopeDefaultModel | null
{
  if (!row)
  {
    return null;
  }
  return { defaultModel: row.defaultModel, autoConfig: (row.autoConfig as AutoRoutingConfig | null) ?? null };
}

/**
 * Resolve the effective model for each entitled skill in a compiled contract (Track AIR.2). Loads
 * the scope defaults (the tenant's ClusterTenant default, when it has one, plus the Global default)
 * once, loads the posture rows for the named skills, then applies the pure precedence resolver
 * (`_ResolveSkillModel`) per skill: pinned → pinnedModel; auto → scope-default model under the
 * skill's auto config; null → scope default; otherwise null (the pod falls back to its own default).
 *
 * This performs NO LiteLLM calls — it is pure resolution over DB rows.
 *
 * @param prisma        - Prisma client used to load posture rows and scope defaults.
 * @param skills        - The entitled skills (id + name) from the compiled contract.
 * @param clusterTenant - The tenant's owning ClusterTenant ref, or null when unassigned.
 * @returns One {@link ResolvedSkillModel} per entitled skill, in input order.
 */
export async function _ResolveContractSkillModels(
  prisma: PrismaClient,
  skills: ReadonlyArray<{ id: string; name: string }>,
  clusterTenant: string | null,
): Promise<ResolvedSkillModel[]>
{
  // 1. Nothing entitled → nothing to resolve; skip every query.
  if (skills.length === 0)
  {
    return [];
  }

  // 2. Load the scope defaults once: the Global default always applies; the ClusterTenant default
  //    applies only when the tenant is assigned to one. Both feed the precedence chain. Prisma's
  //    compound-unique selector cannot express a null clusterTenant, so use findFirst on the pair.
  const globalDefaultRow = await prisma.modelRoutingDefault.findFirst({
    where: { scope: "Global", clusterTenant: null },
  });
  const clusterTenantDefaultRow = clusterTenant
    ? await prisma.modelRoutingDefault.findFirst({ where: { scope: "ClusterTenant", clusterTenant } })
    : null;

  const defaults: ScopeDefaults = {
    clusterTenant: _toScopeDefault(clusterTenantDefaultRow),
    global: _toScopeDefault(globalDefaultRow),
  };

  // 3. Load the posture rows for the entitled skill names. The `Skill` model is keyed by
  //    (name, scope, team); the contract joins by name, so collapse rows by name — preferring a
  //    posture-bearing row over a null-posture one (a name with no posture row simply inherits the
  //    scope default).
  const names = Array.from(new Set(skills.map(function _name(s) { return s.name; })));
  const postureRows = await prisma.skill.findMany({
    where: { name: { in: names } },
    select: { name: true, modelMode: true, pinnedModel: true, autoConfig: true },
  }) as SkillPostureRow[];

  const postureByName = new Map<string, SkillPostureRow>();
  for (const row of postureRows)
  {
    // Prefer a row that actually declares a posture so a null-posture duplicate cannot shadow it.
    const existing = postureByName.get(row.name);
    if (!existing || (existing.modelMode === null && row.modelMode !== null))
    {
      postureByName.set(row.name, row);
    }
  }

  // 4. Resolve each entitled skill through the pure precedence helper.
  return skills.map(function _resolve(skill): ResolvedSkillModel
  {
    const posture = postureByName.get(skill.name);
    const resolution = _ResolveSkillModel(
      {
        modelMode: _toContractMode(posture?.modelMode ?? null),
        pinnedModel: posture?.pinnedModel ?? null,
        autoConfig: (posture?.autoConfig as AutoRoutingConfig | null) ?? null,
      },
      defaults,
    );
    return { skillId: skill.id, model: resolution.model, auto: resolution.auto };
  });
}
