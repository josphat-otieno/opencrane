import { Buffer } from "node:buffer";

import * as k8s from "@kubernetes/client-node";
import pino from "pino";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { defaultConfig } from "../fixtures.js";
import { CogneeLiteLlmKey, COGNEE_LITELLM_KEY_SECRET_NAME } from "../../reconcilers/tenants/internal/cognee-litellm-key.js";
import type { OpenClawTenantOperatorConfig } from "../../app/config.js";

const _log = pino({ level: "silent" });

/** Config with LiteLLM enabled + a master key, the baseline for these tests. */
const _enabledConfig: OpenClawTenantOperatorConfig = {
  ...defaultConfig,
  liteLlmEnabled: true,
  liteLlmEndpoint: "http://litellm:4000",
  liteLlmMasterKey: "sk-master",
  liteLlmBudgetDuration: "30d",
  cogneeLiteLlmMonthlyBudgetUsd: 15,
};

/** Stub CoreV1Api: throws (Secret missing → create path) or returns the given key (update path). */
function _makeCoreApi(existingKeyValue?: string): k8s.CoreV1Api
{
  return {
    readNamespacedSecret: vi.fn().mockImplementation(function _read(): Promise<k8s.V1Secret>
    {
      if (existingKeyValue === undefined)
      {
        return Promise.reject(new Error("404 not found"));
      }

      return Promise.resolve({
        data: { apiKey: Buffer.from(existingKeyValue).toString("base64") },
      } as unknown as k8s.V1Secret);
    }),
  } as unknown as k8s.CoreV1Api;
}

/** Stub KubernetesObjectApi recording server-side applies without a cluster. */
function _makeObjectApi(): k8s.KubernetesObjectApi
{
  return {
    read: vi.fn().mockRejectedValue(new Error("not found")),
    patch: vi.fn().mockResolvedValue({ body: {} }),
    create: vi.fn().mockResolvedValue({ body: {} }),
  } as unknown as k8s.KubernetesObjectApi;
}

/** Stub AppsV1Api: lists a single cognee Deployment (or none) and records restart patches. */
function _makeAppsApi(deploymentNames: string[] = ["opencrane-elewa-opencrane-cognee"]): k8s.AppsV1Api
{
  return {
    listNamespacedDeployment: vi.fn().mockResolvedValue({
      items: deploymentNames.map(function _toDeployment(name) { return { metadata: { name } }; }),
    }),
    patchNamespacedDeployment: vi.fn().mockResolvedValue({}),
  } as unknown as k8s.AppsV1Api;
}

/** Parse the JSON body of a recorded fetch call. */
function _bodyOf(call: unknown[]): Record<string, unknown>
{
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("CogneeLiteLlmKey", () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
  });

  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  it("generate mints a key with its own alias/budget and NEVER sends team_id", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-cognee-new" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi(), _makeObjectApi(), _makeAppsApi(), _log);
    await keys.ensureCogneeLiteLlmKeySecret("acme", "default");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://litellm:4000/key/generate");

    const body = _bodyOf(fetchMock.mock.calls[0]);
    expect(body["key_alias"]).toBe("opencrane-cognee-acme");
    expect(body["metadata"]).toEqual({ clusterTenant: "acme", component: "cognee" });
    expect(body["max_budget"]).toBe(15);
    expect(body["budget_duration"]).toBe("30d");
    // The whole point of a dedicated key: no team_id, ever — LiteLLM's Team object is not
    // provisioned anywhere in this codebase, and attaching team_id 404s (the elewa bug).
    expect(body).not.toHaveProperty("team_id");
  });

  it("writes the minted key to the fixed COGNEE_LITELLM_KEY_SECRET_NAME (chart-agreed literal)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-cognee-new" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const objectApi = _makeObjectApi();
    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi(), objectApi, _makeAppsApi(), _log);
    await keys.ensureCogneeLiteLlmKeySecret("acme", "opencrane-elewa");

    expect(objectApi.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const created = (objectApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as k8s.V1Secret;
    expect(created.metadata?.name).toBe(COGNEE_LITELLM_KEY_SECRET_NAME);
    expect(created.metadata?.namespace).toBe("opencrane-elewa");
    expect(Buffer.from(created.data!["apiKey"], "base64").toString("utf8")).toBe("sk-cognee-new");
  });

  it("existing-secret path calls /key/update with the existing key value (no rotation, no generate)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const objectApi = _makeObjectApi();
    const appsApi = _makeAppsApi();
    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi("sk-cognee-existing"), objectApi, appsApi, _log);
    await keys.ensureCogneeLiteLlmKeySecret("acme", "default");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://litellm:4000/key/update");

    // The existing-secret (reconcile-params) path must NOT restart Cognee — the key value
    // didn't rotate, so any pod already running still has the credential it started with.
    expect(appsApi.patchNamespacedDeployment as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();

    const body = _bodyOf(fetchMock.mock.calls[0]);
    expect(body["key"]).toBe("sk-cognee-existing");
    expect(body["max_budget"]).toBe(15);
    expect(body).not.toHaveProperty("team_id");

    // No new Secret written → key value is not rotated.
    expect(objectApi.patch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(objectApi.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("does not crash reconcile when /key/update fails (best-effort, non-fatal)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi("sk-cognee-existing"), _makeObjectApi(), _makeAppsApi(), _log);
    await expect(keys.ensureCogneeLiteLlmKeySecret("acme", "default")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when LITELLM_MASTER_KEY is missing while enabled", async () =>
  {
    const keys = new CogneeLiteLlmKey({ ..._enabledConfig, liteLlmMasterKey: "" }, _makeCoreApi(), _makeObjectApi(), _makeAppsApi(), _log);
    await expect(keys.ensureCogneeLiteLlmKeySecret("acme", "default")).rejects.toThrow(/LITELLM_MASTER_KEY is required/);
  });

  it("is a no-op when LiteLLM integration is disabled", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const keys = new CogneeLiteLlmKey(defaultConfig, _makeCoreApi(), _makeObjectApi(), _makeAppsApi(), _log);
    await keys.ensureCogneeLiteLlmKeySecret("acme", "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restarts the cognee Deployment (found by label) on the CREATE path, closing the boot-order race", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-cognee-new" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const appsApi = _makeAppsApi(["opencrane-elewa-opencrane-cognee"]);
    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi(), _makeObjectApi(), appsApi, _log);
    await keys.ensureCogneeLiteLlmKeySecret("acme", "opencrane-elewa");

    expect(appsApi.listNamespacedDeployment as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "opencrane-elewa", labelSelector: "app.kubernetes.io/component=cognee" }),
    );
    expect(appsApi.patchNamespacedDeployment as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const [patchArgs] = (appsApi.patchNamespacedDeployment as ReturnType<typeof vi.fn>).mock.calls[0] as [{ name: string; namespace: string; body: unknown }];
    expect(patchArgs.name).toBe("opencrane-elewa-opencrane-cognee");
    expect(patchArgs.namespace).toBe("opencrane-elewa");
  });

  it("does not crash the set when no cognee Deployment is found to restart", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-cognee-new" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const appsApi = _makeAppsApi([]);
    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi(), _makeObjectApi(), appsApi, _log);
    await expect(keys.ensureCogneeLiteLlmKeySecret("acme", "default")).resolves.toBeUndefined();
    expect(appsApi.patchNamespacedDeployment as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("does not crash the set when the restart patch fails (best-effort, non-fatal); the Secret is already durably written regardless", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-cognee-new" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const appsApi = {
      listNamespacedDeployment: vi.fn().mockResolvedValue({ items: [{ metadata: { name: "opencrane-elewa-opencrane-cognee" } }] }),
      patchNamespacedDeployment: vi.fn().mockRejectedValue(new Error("RBAC denied")),
    } as unknown as k8s.AppsV1Api;
    const objectApi = _makeObjectApi();
    const keys = new CogneeLiteLlmKey(_enabledConfig, _makeCoreApi(), objectApi, appsApi, _log);

    await expect(keys.ensureCogneeLiteLlmKeySecret("acme", "default")).resolves.toBeUndefined();
    expect(objectApi.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
