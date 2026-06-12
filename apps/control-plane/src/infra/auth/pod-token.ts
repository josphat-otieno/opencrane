import * as k8s from "@kubernetes/client-node";

import type { PodTokenMintParams, PodTokenResult } from "./pod-token.types.js";

/**
 * Mint a short-lived, audience-bound access token for a tenant's OpenClaw pod.
 *
 * This is the IAM-native counterpart to the kubelet-projected ServiceAccount
 * tokens the pod itself uses: instead of issuing a custom-signed JWT, the
 * control-plane asks the Kubernetes API server (TokenRequest subresource) for a
 * token bound to the tenant pod's ServiceAccount.
 *
 * Requires `create` on `serviceaccounts/token` for the control-plane SA — see
 * `platform/helm/templates/control-plane-rbac.yaml`.
 *
 * @param coreApi - Kubernetes Core V1 API client.
 * @param params  - Namespace, ServiceAccount name, audience, and lifetime.
 * @returns The token and its API-server-reported expiry.
 * @throws When the API server returns no token in the response status.
 */
export async function _MintPodToken(coreApi: k8s.CoreV1Api, params: PodTokenMintParams): Promise<PodTokenResult>
{
	const body = new k8s.AuthenticationV1TokenRequest();
	body.spec = new k8s.V1TokenRequestSpec();
	body.spec.audiences = [params.audience];
	body.spec.expirationSeconds = params.expirationSeconds;

	const result = await coreApi.createNamespacedServiceAccountToken({
		name: params.serviceAccountName,
		namespace: params.namespace,
		body,
	});

	const token = result.status?.token;
	if (!token)
	{
		throw new Error("TokenRequest returned no token in the response status");
	}

	const expiry = result.status?.expirationTimestamp;
	if (!expiry)
	{
		throw new Error("TokenRequest returned no expirationTimestamp in the response status");
	}

	const expiresAt = expiry instanceof Date ? expiry.toISOString() : new Date(expiry).toISOString();

	return { token, expiresAt };
}
