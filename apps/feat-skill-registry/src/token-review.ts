import * as k8s from "@kubernetes/client-node";

import type { TokenReviewResult } from "./token-review.types.js";

/**
 * Validate a Kubernetes projected ServiceAccount token and extract the tenant name.
 *
 * Projected tokens used by tenant pods carry the subject:
 *   system:serviceaccount:<namespace>:<tenant-name>
 *
 * The audience is expected to be "feat-skill-registry" — tokens not bound to that
 * audience are rejected so pods cannot use tokens intended for other planes.
 *
 * @param authApi - Kubernetes Authentication V1 API client.
 * @param token   - Raw bearer token from the Authorization header.
 * @returns Validated tenant name and namespace, or a rejection reason.
 */
export async function _ReviewToken(authApi: k8s.AuthenticationV1Api, token: string): Promise<TokenReviewResult>
{
  let response: k8s.V1TokenReview;
  try
  {
    // 1. Ask Kubernetes to validate the projected token for this service's audience.
    const review = new k8s.V1TokenReview();
    review.spec = new k8s.V1TokenReviewSpec();
    review.spec.token = token;
    review.spec.audiences = ["feat-skill-registry"];

    response = await authApi.createTokenReview({ body: review });
  }
  catch (err)
  {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, reason: `TokenReview API call failed: ${message}` };
  }

  // 2. Reject unauthenticated tokens before deriving any tenant identity.
  if (!response.status?.authenticated)
  {
    return { ok: false, reason: response.status?.error ?? "token not authenticated" };
  }

  // 3. Confirm Kubernetes authenticated the token for this service, not another plane.
  if (!response.status.audiences?.includes("feat-skill-registry"))
  {
    return { ok: false, reason: "token audience does not include feat-skill-registry" };
  }

  // 4. Extract the namespace and tenant name from the ServiceAccount subject.
  const subject = response.status.user?.username ?? "";
  const parts = subject.split(":");
  if (parts.length !== 4 || parts[0] !== "system" || parts[1] !== "serviceaccount")
  {
    return { ok: false, reason: `unexpected token subject format: ${subject}` };
  }

  const namespace = parts[2];
  const tenantName = parts[3];

  // 5. Return only the identity Kubernetes authenticated for the expected audience.
  return { ok: true, tenantName, namespace };
}
