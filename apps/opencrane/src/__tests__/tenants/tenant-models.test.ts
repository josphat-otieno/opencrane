import pino from "pino";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { _FetchTenantModels } from "../../reconcilers/tenants/internal/tenant-models.js";

const _log = pino({ level: "silent" });
const _controlPlaneUrl = "http://opencrane-opencrane-server.default.svc:3000";

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

  it("reports ok with the parsed model set on a non-empty 200 response", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: ["gpt-4o", "claude-opus-4-8"], defaultModel: "gpt-4o" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toEqual({ status: "ok", modelSet: { models: ["gpt-4o", "claude-opus-4-8"], defaultModel: "gpt-4o" } });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${_controlPlaneUrl}/api/internal/tenant-models/acme-user`);
  });

  it("reports error (non-fatal) on a network error", async () =>
  {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toEqual({ status: "error", modelSet: null });
  });

  it("reports error on a non-200 response", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "ghost", _log);

    expect(result).toEqual({ status: "error", modelSet: null });
  });

  it("reports empty (NOT error) on a well-formed 200 with no models", async () =>
  {
    // The onboarding-incomplete case: the endpoint is healthy but the tenant has no
    // registered models. This must be distinguishable from a fetch failure so the gate
    // can log/condition it differently while still refusing to clobber a good config.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: [], defaultModel: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "fresh-org", _log);

    expect(result).toEqual({ status: "empty", modelSet: { models: [], defaultModel: null } });
  });

  it("reports error without calling fetch when the opencrane-ui URL is empty", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels("", "acme-user", _log);

    expect(result).toEqual({ status: "error", modelSet: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports error on a malformed body rather than throwing", async () =>
  {
    // A body whose `models` is not an array means the real model set is unknown — treat
    // as error, not empty, so a good config is never clobbered on a garbled response.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: "oops", defaultModel: 7 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await _FetchTenantModels(_controlPlaneUrl, "acme-user", _log);

    expect(result).toEqual({ status: "error", modelSet: null });
  });
});
