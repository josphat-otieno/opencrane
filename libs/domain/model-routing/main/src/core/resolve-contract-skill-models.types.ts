/**
 * Types for the contract-side skill-model resolution (Track AIR.2). These wrap the pure
 * `_ResolveSkillModel` helper with the DB-loading concerns the effective-contract compiler needs:
 * loading scope defaults once and per-skill postures by name.
 */

/** A resolved entitled-skill model entry, projected into the effective contract's skills section. */
export interface ResolvedSkillModel
{
  /** The entitled skill bundle id (the contract's stable skill identifier). */
  skillId: string;
  /** The resolved `publicModelName`, or null when nothing in the chain resolves (pod uses its own default). */
  model: string | null;
  /** Whether the resolved selection is an auto-routing posture. */
  auto: boolean;
}
