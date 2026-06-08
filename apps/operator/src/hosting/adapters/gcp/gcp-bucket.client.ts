// Type-only import — erased at compile time, so it creates NO runtime dependency
// on @google-cloud/storage. The actual module is loaded lazily in _getStorage().
import type { Storage } from "@google-cloud/storage";

/**
 * Minimal interface over GCS bucket operations.
 * Injected into GcpHostingAdapter so tests can substitute a fake without
 * importing @google-cloud/storage.
 */
export interface GcsBucketOperations
{
  /** Create the bucket if it does not already exist. Idempotent. */
  ensureBucket(bucketName: string): Promise<void>;
}

/**
 * Production GCS client wrapper.
 *
 * The @google-cloud/storage SDK is an OPTIONAL dependency, loaded lazily via
 * dynamic import only when a GCP storage operation actually runs. This keeps
 * the on-prem default free of any cloud SDK at install or runtime — an on-prem
 * image can omit the package entirely (`pnpm install --no-optional`) and the
 * operator still starts and reconciles, because this code path is never taken.
 *
 * Uses Application Default Credentials (Workload Identity on GKE); no static
 * credentials are read.
 */
export class GcpBucketClient implements GcsBucketOperations
{
  /** GCP project that owns the buckets. */
  private readonly projectId: string;

  /** Lazily-initialised SDK client; null until the first storage operation. */
  private storage: Storage | null = null;

  /**
   * @param projectId - GCP project that owns the buckets.
   */
  public constructor(projectId: string)
  {
    this.projectId = projectId;
  }

  /** Create the bucket in the configured project if it does not already exist. */
  public async ensureBucket(bucketName: string): Promise<void>
  {
    // 1. Resolve the SDK client lazily so on-prem never loads the cloud SDK.
    const storage = await this._getStorage();

    // 2. Check existence first to avoid a spurious CreateBucket on every reconcile.
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();

    // 3. Create only when absent; repeated reconciles are safe (idempotent).
    if (!exists)
    {
      await bucket.create();
    }
  }

  /**
   * Lazily import @google-cloud/storage and memoise the client.
   * Throws a clear, actionable error if the optional dependency is missing.
   */
  private async _getStorage(): Promise<Storage>
  {
    // 1. Return the memoised client when already initialised.
    if (this.storage)
    {
      return this.storage;
    }

    // 2. Dynamically load the optional SDK — only reached for HOSTING_PROVIDER=gcp.
    try
    {
      const sdk = await import("@google-cloud/storage");
      this.storage = new sdk.Storage({ projectId: this.projectId });
      return this.storage;
    }
    catch (err)
    {
      // 3. Surface a precise install hint rather than a raw module-not-found error.
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        "@google-cloud/storage is required for HOSTING_PROVIDER=gcp but could not be loaded. "
        + "Install the optional GCP dependency (pnpm install, without --no-optional). "
        + `Original error: ${detail}`,
      );
    }
  }
}
