import { describe, it, expect, vi } from "vitest";
import * as k8s from "@kubernetes/client-node";
import { _ReviewToken } from "../token-review.js";

/** Build a minimal mock AuthenticationV1Api with a controlled createTokenReview response. */
function _makeAuthApi(reviewResponse: Partial<k8s.V1TokenReview>): k8s.AuthenticationV1Api
{
  return {
    createTokenReview: vi.fn().mockResolvedValue(reviewResponse as k8s.V1TokenReview),
  } as unknown as k8s.AuthenticationV1Api;
}

/** Build a V1TokenReview status representing a successful review. */
function _successStatus(namespace: string, tenantName: string): k8s.V1TokenReviewStatus
{
  return {
    authenticated: true,
    audiences: ["feat-skill-registry"],
    user: { username: `system:serviceaccount:${namespace}:${tenantName}` },
  };
}

describe("_ReviewToken", () =>
{
  it("returns tenantName and namespace on a valid projected token", async () =>
  {
    const authApi = _makeAuthApi({ status: _successStatus("opencrane", "team-alpha") });
    const result = await _ReviewToken(authApi, "tok.abc.xyz");

    expect(result).toEqual({ ok: true, tenantName: "team-alpha", namespace: "opencrane" });
  });

  it("rejects when Kubernetes API returns authenticated=false", async () =>
  {
    const authApi = _makeAuthApi({ status: { authenticated: false, error: "expired token" } });
    const result = await _ReviewToken(authApi, "tok.bad");

    expect(result).toEqual({ ok: false, reason: "expired token" });
  });

  it("rejects when authenticated but audience is missing feat-skill-registry", async () =>
  {
    const authApi = _makeAuthApi({
      status: {
        authenticated: true,
        audiences: ["obot-gateway"],
        user: { username: "system:serviceaccount:opencrane:team-alpha" },
      },
    });
    const result = await _ReviewToken(authApi, "tok.wrong-audience");

    expect(result).toEqual({ ok: false, reason: "token audience does not include feat-skill-registry" });
  });

  it("rejects when subject format is unexpected", async () =>
  {
    const authApi = _makeAuthApi({
      status: {
        authenticated: true,
        audiences: ["feat-skill-registry"],
        user: { username: "user:alice" },
      },
    });
    const result = await _ReviewToken(authApi, "tok.bad-subject");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("unexpected token subject format");
  });

  it("rejects when Kubernetes API call throws", async () =>
  {
    const authApi = {
      createTokenReview: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as k8s.AuthenticationV1Api;

    const result = await _ReviewToken(authApi, "tok.error");

    expect(result).toEqual({ ok: false, reason: "TokenReview API call failed: connection refused" });
  });

  it("falls back to generic message when status is missing", async () =>
  {
    const authApi = _makeAuthApi({ status: { authenticated: false } });
    const result = await _ReviewToken(authApi, "tok.no-error");

    expect(result).toEqual({ ok: false, reason: "token not authenticated" });
  });
});
