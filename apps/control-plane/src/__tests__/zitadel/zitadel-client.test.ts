import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _BuildZitadelManagementClient, _DeriveOrgRedirectUri, _NoopZitadelManagementClient, _ReadZitadelClientConfig } from "../../core/zitadel/zitadel-client.js";

describe("_NoopZitadelManagementClient — safe unconfigured behaviour", function _noopSuite()
{
  it("reports not-live and provisions nothing (returns null)", async function _provisionsNull()
  {
    const client = new _NoopZitadelManagementClient();
    expect(client.isLive).toBe(false);
    const result = await client.provisionOrg({ orgName: "acme", displayName: "Acme", redirectUri: "https://acme.example.com/api/v1/auth/callback", masterSubject: "s1" });
    expect(result).toBeNull();
  });

  it("tears down nothing without throwing", async function _teardownNoop()
  {
    await expect(new _NoopZitadelManagementClient().teardownOrg("zorg-1")).resolves.toBeUndefined();
  });
});

describe("_DeriveOrgRedirectUri", function _deriveSuite()
{
  it("derives the per-org callback URI from the org name + base domain", function _derives()
  {
    expect(_DeriveOrgRedirectUri("elewa-be", "dev.opencrane.ai")).toBe("https://elewa-be.dev.opencrane.ai/api/v1/auth/callback");
  });
});

describe("_ReadZitadelClientConfig + factory — fail-safe when unconfigured", function _configSuite()
{
  let _saved: NodeJS.ProcessEnv;

  beforeEach(function _save() { _saved = process.env; process.env = { ..._saved }; });
  afterEach(function _restore() { process.env = _saved; });

  it("returns null config when any required var is missing", function _partial()
  {
    process.env.ZITADEL_MGMT_API_URL = "https://zitadel.example.com";
    process.env.ZITADEL_PROJECT_ID = "p1";
    // ZITADEL_MGMT_SA_KEY + PLATFORM_BASE_DOMAIN intentionally absent.
    delete process.env.ZITADEL_MGMT_SA_KEY;
    delete process.env.PLATFORM_BASE_DOMAIN;
    expect(_ReadZitadelClientConfig()).toBeNull();
  });

  it("reads a complete config", function _complete()
  {
    process.env.ZITADEL_MGMT_API_URL = "https://zitadel.example.com";
    process.env.ZITADEL_MGMT_SA_KEY = "{\"type\":\"serviceaccount\"}";
    process.env.ZITADEL_PROJECT_ID = "p1";
    process.env.PLATFORM_BASE_DOMAIN = "dev.opencrane.ai";
    expect(_ReadZitadelClientConfig()).toEqual({
      apiUrl: "https://zitadel.example.com",
      serviceAccountKey: "{\"type\":\"serviceaccount\"}",
      projectId: "p1",
      baseDomain: "dev.opencrane.ai",
    });
  });

  it("factory returns a non-live (no-op) client whether or not configured (live impl is the next slice)", function _factory()
  {
    delete process.env.ZITADEL_MGMT_API_URL;
    expect(_BuildZitadelManagementClient().isLive).toBe(false);
  });
});
