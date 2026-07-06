/**
 * Write path for org memory — the agent "remember" behaviour that promotes a
 * generalizable learning UP into the shared Cognee knowledge graph, so OTHER agents
 * can later retrieve it. This is the explicit high-value persistence the retrieval
 * deep-dive calls for (baseline harvest ingest is the harvesting-agent's job).
 *
 * Kept in-pod and direct-to-Cognee for symmetry with the read path (AwarenessClient).
 * Dataset WRITE authorization is enforced server-side by Cognee's backend access
 * control (`backendAccessControl: true`); this client stamps provenance so a
 * remembered fact is attributable and later citable on the read side.
 */

/** Cognee dataset scope. Mirrors the operator's `DatasetScope` (schema.prisma). */
export type DatasetScope = "org" | "team" | "department" | "project" | "personal";

/** Scopes that address a specific subject and therefore REQUIRE one. */
const _SUBJECT_REQUIRED: ReadonlySet<DatasetScope> = new Set<DatasetScope>(["team", "department", "project"]);

/** The `/v1/add` request body Cognee accepts (mirrors harvesting-agent's ingest). */
export interface CogneeAddPayload
{
  /** The content to persist. */
  data: string;
  /** Target dataset name (scope-derived — the relevance partition). */
  dataset_name: string;
  /** Provenance + policy metadata; drives later citation + ACL placement. */
  metadata: Record<string, unknown>;
}

/**
 * Pluggable Cognee ingest transport (default: `fetch` POST to `/v1/add`).
 * Injectable so the writer is unit-testable without a live backend.
 */
export type CogneeAddTransport = (endpoint: string, payload: CogneeAddPayload, signal?: AbortSignal) => Promise<void>;

/** Parameters for a single `memory_remember` call. */
export interface MemoryWriteParams
{
  /** The fact/learning to persist. */
  content: string;
  /** A short title so the stored fact is citable when retrieved later. */
  title: string;
  /** Which shared scope this belongs to. */
  scope: DatasetScope;
  /** Subject for scoped datasets (e.g. team name); required for team/department/project. */
  subject?: string;
  /** Optional sensitivity tags carried into Cognee metadata. */
  sensitivityTags?: string[];
}

/** Result of a successful remember: the dataset the fact landed in. */
export interface MemoryWriteResult
{
  /** The resolved Cognee dataset name the fact was written to. */
  dataset: string;
}

/**
 * Resolve the Cognee dataset name for a scope+subject, aligned with the
 * harvesting-agent's `_ResolveDatasetName` (`<scope>/<subject>`, or bare `org`).
 *
 * @param scope   - The dataset scope.
 * @param subject - The subject (team/department/project id, or personal owner).
 * @param owner   - Fallback subject for `personal` scope (the tenant/agent identity).
 * @returns The dataset name string.
 * @throws When a subject-requiring scope is missing its subject.
 */
export function _ResolveDatasetName(scope: DatasetScope, subject: string | undefined, owner: string): string
{
  if (scope === "org")
  {
    return "org";
  }

  if (scope === "personal")
  {
    // Personal scope defaults to the pod owner when no explicit subject is given.
    const who = subject?.trim() || owner.trim();
    if (!who)
    {
      throw new Error("personal scope requires a subject or a known owner identity");
    }
    return `personal/${who}`;
  }

  const trimmed = subject?.trim();
  if (_SUBJECT_REQUIRED.has(scope) && !trimmed)
  {
    throw new Error(`${scope} scope requires a subject (e.g. the ${scope} name)`);
  }
  return `${scope}/${trimmed}`;
}

/**
 * The org-memory writer: turns a `memory_remember` request into a provenance-stamped
 * Cognee ingest. Provenance marks the fact as agent-authored and owned by this tenant,
 * and stamps freshness so the read side can build a citation for it later.
 */
export class MemoryWriter
{
  /** Cognee base URL (no trailing slash). */
  private readonly endpoint: string;

  /** Tenant/agent identity recorded as the fact's owner + personal-scope subject. */
  private readonly owner: string;

  /** The ingest transport (default `fetch` → `/v1/add`). */
  private readonly add: CogneeAddTransport;

  /** Clock, injectable for deterministic tests. */
  private readonly now: () => Date;

  /**
   * @param options - Endpoint, owner identity, optional transport + clock overrides.
   */
  constructor(options: { endpoint: string; owner: string; add?: CogneeAddTransport; now?: () => Date })
  {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.owner = options.owner;
    this.add = options.add ?? _DefaultCogneeAdd;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Persist a generalizable fact to the resolved shared dataset.
   *
   * @param params - The remember request.
   * @param signal - Optional abort signal.
   * @returns The dataset the fact was written to.
   */
  async remember(params: MemoryWriteParams, signal?: AbortSignal): Promise<MemoryWriteResult>
  {
    const dataset = _ResolveDatasetName(params.scope, params.subject, this.owner);
    const timestamp = this.now().toISOString();

    const metadata: Record<string, unknown> = {
      // Provenance: mark this as an agent-authored memory owned by the tenant, so the
      // graph can distinguish it from harvested source documents and attribute it.
      source: "agent-remember",
      acl_origin: "agent",
      owner: this.owner,
      title: params.title,
      scope: params.scope,
      // Freshness so the read side (AwarenessClient) can build a complete citation.
      source_updated_at: timestamp,
      freshness_recorded_at: timestamp,
    };
    if (params.subject) { metadata.subject = params.subject; }
    if (params.sensitivityTags && params.sensitivityTags.length > 0) { metadata.sensitivity_tags = params.sensitivityTags; }

    await this.add(this.endpoint, { data: params.content, dataset_name: dataset, metadata }, signal);
    return { dataset };
  }
}

/**
 * Default Cognee ingest transport: a `fetch` POST to `<endpoint>/v1/add`.
 *
 * @param endpoint - Cognee base URL (no trailing slash).
 * @param payload  - The ingest body.
 * @param signal   - Optional abort signal.
 * @throws When Cognee responds non-2xx.
 */
const _DefaultCogneeAdd: CogneeAddTransport = async function _add(endpoint, payload, signal)
{
  const res = await fetch(`${endpoint}/v1/add`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok)
  {
    throw new Error(`Cognee ingest failed: ${res.status} ${res.statusText}`);
  }
};
