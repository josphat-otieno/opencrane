import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { skillCatalogRouter } from "../../routes/skill-catalog.js";
import type { OciBundleStore } from "../../core/oci/oci-bundle-store.js";

const _DIGEST = "sha256:" + "a".repeat(64);

/** Build a test app mounting the catalog router, optionally with an OCI store. */
function _buildApp(prisma: PrismaClient, ociStore: OciBundleStore | null = null): Express
{
	const app = express();
	app.use(express.json());
	app.use("/api/v1/skills/catalog", skillCatalogRouter(prisma, ociStore));
	return app;
}

describe("skillCatalogRouter — POST /backfill", function _suite()
{
	it("returns 409 when no OCI store is configured", async function _notConfigured()
	{
		const prisma = { skillBundle: { findMany: vi.fn() } } as unknown as PrismaClient;
		const app = _buildApp(prisma, null);

		const res = await request(app).post("/api/v1/skills/catalog/backfill");

		expect(res.status).toBe(409);
		expect(res.body.code).toBe("OCI_STORE_NOT_CONFIGURED");
	});

	it("pushes published bundles and returns a summary + writes an audit entry", async function _backfills()
	{
		const auditCreate = vi.fn().mockResolvedValue({});
		const prisma = {
			skillBundle: {
				findMany: vi.fn().mockResolvedValue([{ id: "b1", name: "alpha", digest: _DIGEST, content: "# alpha" }]),
			},
			auditEntry: { create: auditCreate },
		} as unknown as PrismaClient;
		const ociStore = { pushBundle: vi.fn().mockResolvedValue({ digest: _DIGEST, size: 7 }) } as unknown as OciBundleStore;

		const app = _buildApp(prisma, ociStore);
		const res = await request(app).post("/api/v1/skills/catalog/backfill");

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ total: 1, pushed: 1, skipped: 0, failed: 0 });
		expect(res.body.results[0]).toMatchObject({ id: "b1", outcome: "pushed" });
		expect(auditCreate).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ action: "OciBackfill" }) }),
		);
	});
});
