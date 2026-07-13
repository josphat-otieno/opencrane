import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@opencrane/state/core";
import { _PodTokenFailureStatus } from "../pod-token.util";

describe("_PodTokenFailureStatus", () =>
{
	it("classifies 409 POD_NOT_READY as transient Provisioning, never terminal Refused", () =>
	{
		expect(_PodTokenFailureStatus(409, "POD_NOT_READY")).toBe(ConnectionStatus.Provisioning);
		expect(_PodTokenFailureStatus(409, "POD_NOT_READY")).not.toBe(ConnectionStatus.Refused);
	});

	it("classifies a no/ambiguous workspace (403 / 409 NO_TENANT / 409 AMBIGUOUS_TENANT) as terminal Refused", () =>
	{
		expect(_PodTokenFailureStatus(403, "FORBIDDEN")).toBe(ConnectionStatus.Refused);
		expect(_PodTokenFailureStatus(403, "NO_TENANT")).toBe(ConnectionStatus.Refused);
		expect(_PodTokenFailureStatus(409, "NO_TENANT")).toBe(ConnectionStatus.Refused);
		expect(_PodTokenFailureStatus(409, "AMBIGUOUS_TENANT")).toBe(ConnectionStatus.Refused);
		// Falls back to status when the body carries no recognised code.
		expect(_PodTokenFailureStatus(409, undefined)).toBe(ConnectionStatus.Refused);
	});

	it("backs off transient transport failures (429 / 5xx) as Closed, not Refused", () =>
	{
		expect(_PodTokenFailureStatus(429, undefined)).toBe(ConnectionStatus.Closed);
		expect(_PodTokenFailureStatus(503, undefined)).toBe(ConnectionStatus.Closed);
	});

	it("treats POD_NOT_READY as transient even if the backend ever moves it off 409", () =>
	{
		expect(_PodTokenFailureStatus(503, "POD_NOT_READY")).toBe(ConnectionStatus.Provisioning);
	});
});
