import { ModelRoutingScope as PrismaModelRoutingScope, SkillBundleStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { _EstimateSavings } from "./savings.js";
import type { SavingsOptions, SavingsSample } from "./savings.types.js";
import type { JudgeClient, ModelRunner, RoutingVersionStamps, ShadowMeasureInput, ShadowMeasureOutcome } from "./shadow-measure.types.js";

/**
 * Resolve the version coordinates for a measurement, all best-effort: each lookup is wrapped so a
 * failure (or absent row) leaves its field null and NEVER throws — a missing version/model lookup
 * must not break a measurement. Together they make a datapoint attributable to a specific
 * (skill content version × model deployment).
 *
 * @param prisma - Prisma client for the read-only coordinate lookups.
 * @param input  - The run input carrying the skill identity + candidate model.
 * @returns The resolved coordinates; any field is null when its source could not be resolved.
 */
async function _resolveVersionStamps(prisma: PrismaClient, input: ShadowMeasureInput): Promise<RoutingVersionStamps>
{
  // 1. Skill content hash — the mutable current content version on the Skill row, keyed by its
  //    full compound key (name, scope, team). Best-effort: null on any failure or missing row.
  let skillContentHash: string | null = null;
  try
  {
    const skill = await prisma.skill.findUnique({
      where: { name_scope_team: { name: input.skill.name, scope: input.skill.scope, team: input.skill.team } },
      select: { contentHash: true },
    });
    skillContentHash = skill?.contentHash ?? null;
  }
  catch { skillContentHash = null; }

  // 2. Skill digest — the immutable content version of the live PUBLISHED bundle (most-recently
  //    published wins). Null when no published bundle exists for the skill name.
  let skillDigest: string | null = null;
  try
  {
    const bundle = await prisma.skillBundle.findFirst({
      where: { name: input.skill.name, status: SkillBundleStatus.Published },
      orderBy: { publishedAt: "desc" },
      select: { digest: true },
    });
    skillDigest = bundle?.digest ?? null;
  }
  catch { skillDigest = null; }

  // 3. Candidate model deployment — the stable litellmModelId + upstreamModel for the candidate
  //    slug, resolved scope-aware: a ClusterTenant-owned model (the skill's team is its
  //    ClusterTenant) or a Global one. Null on any failure or missing definition.
  let candidateModelId: string | null = null;
  let candidateUpstreamModel: string | null = null;
  try
  {
    const clusterTenant = input.skill.team.trim() || null;
    const model = await prisma.modelDefinition.findFirst({
      where: {
        publicModelName: input.candidateModel,
        OR: [{ scope: PrismaModelRoutingScope.ClusterTenant, clusterTenant }, { scope: PrismaModelRoutingScope.Global, clusterTenant: null }],
      },
      orderBy: { scope: "asc" },
      select: { litellmModelId: true, upstreamModel: true },
    });
    candidateModelId = model?.litellmModelId ?? null;
    candidateUpstreamModel = model?.upstreamModel ?? null;
  }
  catch { candidateModelId = null; candidateUpstreamModel = null; }

  return { skillContentHash, skillDigest, candidateModelId, candidateUpstreamModel };
}

/**
 * Run an AIR.6 shadow-mode savings measurement for one skill+candidate and persist the result.
 *
 * For each eval case the orchestrator runs the baseline (current) and candidate models through the
 * injected {@link ModelRunner}, judges both with the injected vendor-neutral {@link JudgeClient},
 * marks the call `passedBar` when the candidate's judge score clears the case's `qualityBar`, and
 * builds an on-policy paired sample. It then calls the pure {@link _EstimateSavings} estimator,
 * persists a `RoutingMeasurement`, and — only when the savings CI excludes zero (`ciLowPct > 0`) —
 * persists a Pending `RoutingProposal`. **It changes no live routing; apply happens on approval.**
 *
 * The seams are best-effort: when no judge or runner is configured (null), this is a no-op that
 * records nothing and does not throw — mirroring how the platform degrades when `LITELLM_ENDPOINT`
 * is unset. Persistence is injected (`prisma`) so the orchestrator is unit-testable with mocks.
 *
 * @param prisma  - Prisma client for persistence.
 * @param input   - Skill identity, eval cases, current model, candidate model.
 * @param judge   - The vendor-neutral judge seam, or null when unconfigured.
 * @param runner  - The model-runner seam, or null when unconfigured.
 * @param options - Bootstrap/RNG options forwarded to the savings estimator (for deterministic tests).
 * @returns A tagged outcome: `unconfigured` no-op, or `measured` with the persisted ids.
 */
export async function _RunShadowMeasurement(
  prisma: PrismaClient,
  input: ShadowMeasureInput,
  judge: JudgeClient | null,
  runner: ModelRunner | null,
  options: SavingsOptions = {},
): Promise<ShadowMeasureOutcome>
{
  // 1. Best-effort seam check: without both a runner and a judge there is nothing to measure, so
  //    record nothing and return a no-op (do not throw) — matches the platform's degrade posture.
  if (!judge || !runner || input.evalCases.length === 0 || !input.currentModel)
  {
    return { kind: "unconfigured" };
  }

  // 2. For each eval case, run baseline + candidate, judge the candidate against the case's bar,
  //    and build a paired sample. The baseline is judged too so a live impl can extend to quality
  //    regressions; here passedBar is driven by the candidate clearing the case bar.
  const samples: SavingsSample[] = [];
  for (const evalCase of input.evalCases)
  {
    const baseline = await runner.run(input.currentModel, evalCase.input);
    const candidate = await runner.run(input.candidateModel, evalCase.input);
    const candidateScore = await judge.score(evalCase.input, candidate.output, evalCase.expected ?? null);

    samples.push({
      passedBar: candidateScore >= evalCase.qualityBar,
      baselineCostUsd: baseline.costUsd,
      candidateCostUsd: candidate.costUsd,
    });
  }

  // 3. Run the pure estimator — point estimate of % saved at equal quality plus a bootstrap CI.
  const estimate = _EstimateSavings(samples, options);

  // 4. Resolve the version coordinates (skill content hash, live bundle digest, candidate model
  //    deployment) so the datapoint is attributable to a specific skill-content × model version.
  //    Best-effort: any unresolved coordinate is null and never blocks the measurement.
  const stamps = await _resolveVersionStamps(prisma, input);

  // 5. Persist the measurement regardless of outcome — a null/zero result is still a recorded fact.
  const measurement = await prisma.routingMeasurement.create({
    data: {
      skillName: input.skill.name,
      skillScope: input.skill.scope,
      skillTeam: input.skill.team,
      candidateModel: input.candidateModel,
      sampledCalls: samples.length,
      atBarCheapFraction: estimate.atBarCheapFraction,
      projectedSavingsPct: estimate.projectedSavingsPct,
      ciLowPct: estimate.ciLowPct,
      ciHighPct: estimate.ciHighPct,
      skillContentHash: stamps.skillContentHash,
      skillDigest: stamps.skillDigest,
      candidateModelId: stamps.candidateModelId,
      candidateUpstreamModel: stamps.candidateUpstreamModel,
    },
  });

  // 6. Emit a proposal ONLY when the savings CI excludes zero (ciLowPct > 0). This is the locked
  //    rule: the loop never auto-applies — a Pending proposal awaits explicit human approval.
  if (estimate.ciLowPct > 0)
  {
    const proposal = await prisma.routingProposal.create({
      data: {
        skillName: input.skill.name,
        skillScope: input.skill.scope,
        skillTeam: input.skill.team,
        fromModel: input.currentModel,
        proposedModel: input.candidateModel,
        projectedSavingsPct: estimate.projectedSavingsPct,
        ciLowPct: estimate.ciLowPct,
        ciHighPct: estimate.ciHighPct,
        skillContentHash: stamps.skillContentHash,
        skillDigest: stamps.skillDigest,
        proposedModelId: stamps.candidateModelId,
        measurementId: measurement.id,
      },
    });
    return { kind: "measured", measurementId: measurement.id, proposalId: proposal.id };
  }

  return { kind: "measured", measurementId: measurement.id };
}
