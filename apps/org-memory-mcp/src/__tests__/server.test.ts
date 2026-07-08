import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AwarenessClient } from "@opencrane/awareness";
import type { CogneeSearchHit, CogneeSearchTransport } from "@opencrane/awareness";

import { _FormatAwarenessResult } from "../format.js";
import { _BuildAwarenessClientFromEnv, _BuildMemoryWriterFromEnv } from "../memory-tools.js";
import { _BuildOrgMemoryServer } from "../server.js";
import { MemoryWriter, _ResolveDatasetName } from "../memory-write.js";
import type { CogneeAddPayload } from "../memory-write.js";

/** Build a fake Cognee transport returning fixed rows, so tests need no live backend. */
function _fakeTransport(rows: CogneeSearchHit[]): CogneeSearchTransport
{
  return async function _search() { return rows; };
}

/** A citable hit (complete metadata → survives the SDK citation invariant). */
const _citableRow: CogneeSearchHit = {
  content: "The Q3 launch date is 15 September.",
  score: 0.9,
  datasets: ["team/platform"],
  metadata: {
    title: "Q3 Launch Plan",
    uri: "https://sharepoint/q3-plan",
    source_updated_at: "2026-06-01T00:00:00.000Z",
  },
};

/** An uncitable hit (no title/uri) — the SDK must drop it. */
const _uncitableRow: CogneeSearchHit = { content: "orphan fact", metadata: {} };

/** Wire a Client to a freshly-built org-memory server over an in-memory transport pair.
 * Injects a zero-delay `sleep` so the search-retry loop runs instantly under test. */
async function _connectClient(client: AwarenessClient, writer?: MemoryWriter): Promise<Client>
{
  const server = _BuildOrgMemoryServer({ client, writer, sleep: async function _noWait() {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await mcpClient.connect(clientTransport);
  return mcpClient;
}

/** A read client that returns nothing — sufficient when the test only exercises writes. */
function _emptyReadClient(): AwarenessClient
{
  return new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([]) });
}

/** A MemoryWriter over a capturing add transport, plus the array it records payloads into. */
function _capturingWriter(owner = "acme"): { writer: MemoryWriter; captured: CogneeAddPayload[] }
{
  const captured: CogneeAddPayload[] = [];
  const writer = new MemoryWriter({
    endpoint: "http://cognee:8000",
    owner,
    add: async function _add(_endpoint, payload) { captured.push(payload); },
    now: () => new Date("2026-07-03T00:00:00.000Z"),
  });
  return { writer, captured };
}

describe("_BuildAwarenessClientFromEnv", function _envSuite()
{
  it("throws when COGNEE_ENDPOINT is missing", function _missing()
  {
    expect(() => _BuildAwarenessClientFromEnv({})).toThrow(/COGNEE_ENDPOINT is required/);
  });

  it("builds a client when COGNEE_ENDPOINT is set", function _present()
  {
    expect(() => _BuildAwarenessClientFromEnv({ COGNEE_ENDPOINT: "http://cognee:8000" })).not.toThrow();
  });
});

describe("_FormatAwarenessResult", function _formatSuite()
{
  it("renders each hit with its citation", async function _cited()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "launch date" }));
    expect(text).toContain("The Q3 launch date is 15 September.");
    expect(text).toContain("Source: Q3 Launch Plan — https://sharepoint/q3-plan");
    expect(text).toContain("team/platform");
  });

  it("discloses withheld uncitable hits instead of silently dropping them", async function _dropped()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow, _uncitableRow]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "launch date" }));
    expect(text).toContain("1 uncitable result withheld");
  });

  it("reports no results without inventing content", async function _empty()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([]) });
    const text = _FormatAwarenessResult(await aware.query({ query: "nothing here" }));
    expect(text).toContain("No org-memory results");
  });
});

describe("org-memory MCP surface", function _mcpSuite()
{
  it("exposes a memory_search tool over MCP", async function _lists()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const mcpClient = await _connectClient(aware);
    const { tools } = await mcpClient.listTools();
    expect(tools.map((t) => t.name)).toContain("memory_search");
  });

  it("returns cited org context through a memory_search call", async function _calls()
  {
    const aware = new AwarenessClient({ cogneeEndpoint: "http://cognee:8000", search: _fakeTransport([_citableRow]) });
    const mcpClient = await _connectClient(aware);
    const res = await mcpClient.callTool({ name: "memory_search", arguments: { query: "launch date" } });
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("15 September");
    expect(text).toContain("Source: Q3 Launch Plan");
    expect(res.isError).toBeFalsy();
  });

  it("surfaces a persistent backend failure as a temporary-unavailable retry signal, not a crash", async function _errors()
  {
    let calls = 0;
    const failing = new AwarenessClient({
      cogneeEndpoint: "http://cognee:8000",
      search: async function _boom() { calls += 1; throw new Error("cognee unreachable"); },
    });
    const mcpClient = await _connectClient(failing);
    const res = await mcpClient.callTool({ name: "memory_search", arguments: { query: "x" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    // The agent must be told this is transient and to retry — NOT be handed a bare failure it might
    // dress up into an invented index error.
    expect(text).toContain("Org-memory search is temporarily unavailable (cognee unreachable)");
    expect(text).toContain("wait a few seconds and call memory_search again");
    expect(text).toContain("Do NOT invent");
    // It retried in-process before giving up (defends against a single cold-start flake).
    expect(calls).toBe(3);
  });

  it("retries a transient failure in-process and returns results once it clears", async function _retryRecovers()
  {
    let calls = 0;
    const flaky = new AwarenessClient({
      cogneeEndpoint: "http://cognee:8000",
      // Fail the first two attempts, then succeed on the third with a citable hit.
      search: async function _flaky() { calls += 1; if (calls < 3) { throw new Error("cold start"); } return [_citableRow]; },
    });
    const mcpClient = await _connectClient(flaky);
    const res = await mcpClient.callTool({ name: "memory_search", arguments: { query: "launch date" } });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("15 September");
    expect(text).toContain("Source: Q3 Launch Plan");
    expect(calls).toBe(3);
  });
});

describe("_ResolveDatasetName", function _datasetSuite()
{
  it("maps org to the bare 'org' dataset", function _org()
  {
    expect(_ResolveDatasetName("org", undefined, "acme")).toBe("org");
  });

  it("composes scope/subject for team/department/project", function _scoped()
  {
    expect(_ResolveDatasetName("team", "platform", "acme")).toBe("team/platform");
    expect(_ResolveDatasetName("project", "opencrane", "acme")).toBe("project/opencrane");
  });

  it("requires a subject for team/department/project", function _requiresSubject()
  {
    expect(() => _ResolveDatasetName("team", undefined, "acme")).toThrow(/team scope requires a subject/);
  });

  it("defaults personal scope to the owner", function _personal()
  {
    expect(_ResolveDatasetName("personal", undefined, "acme")).toBe("personal/acme");
    expect(_ResolveDatasetName("personal", "alice", "acme")).toBe("personal/alice");
  });
});

describe("_BuildMemoryWriterFromEnv", function _writerEnvSuite()
{
  it("returns a writer by default when Cognee is set", function _default()
  {
    expect(_BuildMemoryWriterFromEnv({ COGNEE_ENDPOINT: "http://cognee:8000" })).toBeInstanceOf(MemoryWriter);
  });

  it("returns null when writes are disabled by the kill-switch", function _disabled()
  {
    expect(_BuildMemoryWriterFromEnv({ COGNEE_ENDPOINT: "http://cognee:8000", ORG_MEMORY_WRITE_ENABLED: "false" })).toBeNull();
  });

  it("throws when COGNEE_ENDPOINT is missing (and writes enabled)", function _missing()
  {
    expect(() => _BuildMemoryWriterFromEnv({})).toThrow(/COGNEE_ENDPOINT is required/);
  });
});

describe("org-memory write surface", function _writeSuite()
{
  it("stamps provenance + freshness when remembering a fact", async function _provenance()
  {
    const { writer, captured } = _capturingWriter("acme");
    await writer.remember({ content: "Deploy uses helm dep build", title: "Deploy note", scope: "team", subject: "platform", sensitivityTags: ["internal"] });

    expect(captured).toHaveLength(1);
    expect(captured[0].dataset_name).toBe("team/platform");
    expect(captured[0].data).toBe("Deploy uses helm dep build");
    expect(captured[0].metadata).toMatchObject({
      source: "agent-remember",
      acl_origin: "agent",
      owner: "acme",
      title: "Deploy note",
      scope: "team",
      subject: "platform",
      sensitivity_tags: ["internal"],
      source_updated_at: "2026-07-03T00:00:00.000Z",
      freshness_recorded_at: "2026-07-03T00:00:00.000Z",
    });
  });

  it("does NOT register memory_remember when no writer is supplied (read-only pod)", async function _readOnly()
  {
    const mcpClient = await _connectClient(_emptyReadClient());
    const names = (await mcpClient.listTools()).tools.map((t) => t.name);
    expect(names).toContain("memory_search");
    expect(names).not.toContain("memory_remember");
  });

  it("persists a fact through a memory_remember MCP call", async function _remembers()
  {
    const { writer, captured } = _capturingWriter("acme");
    const mcpClient = await _connectClient(_emptyReadClient(), writer);

    const names = (await mcpClient.listTools()).tools.map((t) => t.name);
    expect(names).toContain("memory_remember");

    const res = await mcpClient.callTool({ name: "memory_remember", arguments: { content: "fact", title: "T", scope: "org" } });
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(res.isError).toBeFalsy();
    expect(text).toContain("Remembered to org memory (dataset: org)");
    expect(captured[0].dataset_name).toBe("org");
  });

  it("returns a tool error (not a crash) when a scoped remember omits its subject", async function _missingSubject()
  {
    const { writer } = _capturingWriter("acme");
    const mcpClient = await _connectClient(_emptyReadClient(), writer);
    const res = await mcpClient.callTool({ name: "memory_remember", arguments: { content: "fact", title: "T", scope: "team" } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
    expect(text).toContain("team scope requires a subject");
  });
});
