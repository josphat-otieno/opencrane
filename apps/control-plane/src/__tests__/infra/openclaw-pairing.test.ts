import { describe, expect, it } from "vitest";

import { _ResolveOpenClawPairing } from "../../infra/auth/openclaw-pairing.js";

describe("_ResolveOpenClawPairing", function _suite()
{
	it("uses the stored gateway URL + bootstrap token", function _stored()
	{
		const pairing = _ResolveOpenClawPairing({ openclaw: { gatewayUrl: "wss://pod/gateway", bootstrapToken: "boot" } }, "pod.example.com");
		expect(pairing).toEqual({ gatewayUrl: "wss://pod/gateway", bootstrapToken: "boot" });
	});

	it("derives the gateway URL from ingressHost when none is stored", function _derived()
	{
		const pairing = _ResolveOpenClawPairing(null, "pod.example.com");
		expect(pairing).toEqual({ gatewayUrl: "wss://pod.example.com", bootstrapToken: null });
	});

	it("returns null bootstrapToken once a device is paired", function _paired()
	{
		const pairing = _ResolveOpenClawPairing({ openclaw: { gatewayUrl: "wss://pod/gateway" } }, "pod.example.com");
		expect(pairing?.bootstrapToken).toBeNull();
	});

	it("returns null when there is no URL and no ingress host", function _notReady()
	{
		expect(_ResolveOpenClawPairing(null, null)).toBeNull();
		expect(_ResolveOpenClawPairing({ openclaw: {} }, null)).toBeNull();
	});

	it("ignores a malformed configOverrides shape", function _malformed()
	{
		expect(_ResolveOpenClawPairing("not-an-object", "pod.example.com")?.gatewayUrl).toBe("wss://pod.example.com");
		expect(_ResolveOpenClawPairing({ openclaw: 42 }, null)).toBeNull();
	});
});
