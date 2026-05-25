import type { DatasetScope, TenantDatasetMembership } from "./tenant-datasets.types.js";

/** Annotation keys used to store tenant dataset memberships on the Tenant CR. */
const DATASET_ANNOTATION_KEYS: Record<DatasetScope, string> = {
  org: "opencrane.io/datasets-org",
  team: "opencrane.io/datasets-team",
  project: "opencrane.io/datasets-project",
  personal: "opencrane.io/datasets-personal",
};

/** Default dataset membership for tenants that do not yet carry explicit annotations. */
const DEFAULT_DATASET_MEMBERSHIP: TenantDatasetMembership = {
  org: ["default"],
  team: [],
  project: [],
  personal: [],
};

/**
 * Parse Tenant CR annotations into a normalized dataset membership structure.
 * @param annotations - Raw Tenant CR metadata annotations.
 */
export function _ParseTenantDatasetMembership(
  annotations?: Record<string, string>,
): TenantDatasetMembership
{
  return {
    org: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS.org], DEFAULT_DATASET_MEMBERSHIP.org),
    team: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS.team], DEFAULT_DATASET_MEMBERSHIP.team),
    project: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS.project], DEFAULT_DATASET_MEMBERSHIP.project),
    personal: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS.personal], DEFAULT_DATASET_MEMBERSHIP.personal),
  };
}

/**
 * Convert dataset membership into Tenant CR annotation patch values.
 * @param membership - Membership values received from API callers.
 */
export function _SerializeTenantDatasetMembership(
  membership: TenantDatasetMembership,
): Record<string, string>
{
  return {
    [DATASET_ANNOTATION_KEYS.org]: _SerializeDatasetList(membership.org),
    [DATASET_ANNOTATION_KEYS.team]: _SerializeDatasetList(membership.team),
    [DATASET_ANNOTATION_KEYS.project]: _SerializeDatasetList(membership.project),
    [DATASET_ANNOTATION_KEYS.personal]: _SerializeDatasetList(membership.personal),
  };
}

/**
 * Decide whether a retrieval request should be denied for the requested dataset scope.
 * @param membership - Effective tenant dataset memberships.
 * @param scope - Requested dataset scope.
 * @param datasetId - Requested dataset identifier.
 */
export function _IsDatasetMembershipDenied(
  membership: TenantDatasetMembership,
  scope: DatasetScope,
  datasetId: string,
): boolean
{
  const allowedValues = membership[scope];
  return !allowedValues.includes(datasetId);
}

/**
 * Parse a comma-separated dataset list into normalized values.
 * @param rawValue - Raw annotation string.
 * @param fallback - Fallback list used when annotation is absent.
 */
function _ParseDatasetList(rawValue: string | undefined, fallback: string[]): string[]
{
  if (rawValue === undefined)
  {
    return [...fallback];
  }

  return _NormalizeDatasetValues(rawValue.split(","));
}

/**
 * Serialize normalized dataset list into a comma-separated annotation value.
 * @param values - Dataset IDs.
 */
function _SerializeDatasetList(values: string[]): string
{
  return _NormalizeDatasetValues(values).join(",");
}

/**
 * Normalize dataset IDs by trimming and deduplicating values.
 * @param values - Candidate dataset IDs.
 */
function _NormalizeDatasetValues(values: string[]): string[]
{
  const normalized = values.map(function _trim(value)
  {
    return value.trim();
  }).filter(function _isNonEmpty(value)
  {
    return value.length > 0;
  });

  return Array.from(new Set(normalized)).sort();
}
