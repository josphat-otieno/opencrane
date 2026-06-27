import pino from "pino";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { _FetchTenantModels } from "../../tenants/internal/tenant-models.js";

const _log = pino({ level: "silent" });
const _controlPlaneUrl = "http://opencrane-control-plane.default.svc:3000";

describe("_FetchTenantModels", () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
  });

  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  it("returns the parsed model set on a 200 response", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: ["gpt-4o", "claude-opus-4-8"], defaultModel: "gpt-4o" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toEqual({ models: ["gpt-4o", "claude-opus-4-8"], defaultModel: "gpt-4o" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${_controlPlaneUrl}/api/internal/tenant-models/acme-user`);
  });

  it("returns null (non-fatal) on a network error", async () =>
  {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toBeNull();
  });

  it("returns null on a non-200 response", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "ghost", _log);

    expect(result).toBeNull();
  });

  it("returns null without calling fetch when the control-plane URL is empty", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels("", "acme-user", _log);

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalises a malformed body to an empty model set rather than throwing", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: "oops", defaultModel: 7 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toEqual({ models: [], defaultModel: null });
  });
});
