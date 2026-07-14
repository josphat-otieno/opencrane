/**
 * Result of a Kubernetes TokenReview validation.
 */
export type TokenReviewResult =
  | {
      /** Token was authenticated for the expected audience. */
      ok: true;
      /** Tenant service-account name extracted from the authenticated subject. */
      tenantName: string;
      /** Kubernetes namespace that owns the authenticated service account. */
      namespace: string;
    }
  | {
      /** Token was rejected or Kubernetes validation failed. */
      ok: false;
      /** Operator-facing reason for rejecting the token. */
      reason: string;
    };
