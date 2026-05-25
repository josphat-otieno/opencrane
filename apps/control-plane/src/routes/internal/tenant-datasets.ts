import { DatasetScope } from "./tenant-datasets.types.js";
import type { TenantDatasetMembership } from "./tenant-datasets.types.js";

/** Annotation keys used to store tenant dataset memberships on the Tenant CR. */
const DATASET_ANNOTATION_KEYS: Record<DatasetScope, string> = {
  [DatasetScope.Org]: "opencrane.io/datasets-org",
  [DatasetScope.Team]: "opencrane.io/datasets-team",
  [DatasetScope.Project]: "opencrane.io/datasets-project",
  [DatasetScope.Personal]: "opencrane.io/datasets-personal",
};

/** Default dataset membership for tenants that do not yet carry explicit annotations. */
const DEFAULT_DATASET_MEMBERSHIP: TenantDatasetMembership = {
  [DatasetScope.Org]: ["default"],
  [DatasetScope.Team]: [],
  [DatasetScope.Project]: [],
  [DatasetScope.Personal]: [],
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
    [DatasetScope.Org]: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS[DatasetScope.Org]], DEFAULT_DATASET_MEMBERSHIP[DatasetScope.Org]),
    [DatasetScope.Team]: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS[DatasetScope.Team]], DEFAULT_DATASET_MEMBERSHIP[DatasetScope.Team]),
    [DatasetScope.Project]: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS[DatasetScope.Project]], DEFAULT_DATASET_MEMBERSHIP[DatasetScope.Project]),
    [DatasetScope.Personal]: _ParseDatasetList(annotations?.[DATASET_ANNOTATION_KEYS[DatasetScope.Personal]], DEFAULT_DATASET_MEMBERSHIP[DatasetScope.Personal]),
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
    [DATASET_ANNOTATION_KEYS[DatasetScope.Org]]: _SerializeDatasetList(membership.org),
    [DATASET_ANNOTATION_KEYS[DatasetScope.Team]]: _SerializeDatasetList(membership.team),
    [DATASET_ANNOTATION_KEYS[DatasetScope.Project]]: _SerializeDatasetList(membership.project),
    [DATASET_ANNOTATION_KEYS[DatasetScope.Personal]]: _SerializeDatasetList(membership.personal),
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
