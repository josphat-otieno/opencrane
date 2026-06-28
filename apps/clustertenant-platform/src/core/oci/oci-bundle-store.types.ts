/** The subset of a `fetch` Response the OCI store relies on (Node global fetch satisfies this). */
export interface OciResponse
{
  /** True for 2xx status codes. */
  ok: boolean;

  /** HTTP status code. */
  status: number;

  /** Response header accessor. */
  headers: { get(name: string): string | null };

  /** Resolve the body as text. */
  text(): Promise<string>;
}

/** Init options for an OCI registry request. */
export interface OciRequestInit
{
  /** HTTP method (defaults to GET). */
  method?: string;

  /** Request headers. */
  headers?: Record<string, string>;

  /** Request body (raw string; the store only uploads text bundles). */
  body?: string;
}

/** Narrow fetch signature so the store can be unit-tested with a mock transport. */
export type OciFetch = (url: string, init?: OciRequestInit) => Promise<OciResponse>;

/** Construction options for `OciBundleStore`. */
export interface OciBundleStoreConfig
{
  /** Base URL of the OCI registry (e.g. `http://opencrane-skill-oci:5000`). */
  registryUrl: string;

  /** Repository/name path bundles are stored under (e.g. `skills`). */
  repository: string;

  /** Transport override for tests; defaults to Node global `fetch`. */
  fetchFn?: OciFetch;
}

/** Outcome of pushing a bundle to the registry. */
export interface OciPushResult
{
  /** Content-addressable digest of the stored bundle (`sha256:<hex>`). */
  digest: string;

  /** Size of the stored bundle content in bytes. */
  size: number;
}
