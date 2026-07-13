import { describe, expect, it } from "vitest";

import { _MapSessionSummaries } from "../session-list.util";

describe("_MapSessionSummaries", () =>
{
	it("returns an empty array for non-array input", () =>
	{
		expect(_MapSessionSummaries(null)).toEqual([]);
		expect(_MapSessionSummaries(undefined)).toEqual([]);
		expect(_MapSessionSummaries({})).toEqual([]);
		expect(_MapSessionSummaries("nope")).toEqual([]);
	});

	it("maps the live `key` + `label` row shape with sensible defaults", () =>
	{
		const [row] = _MapSessionSummaries([{ key: "s-abc", label: "Q3 strategy", sessionId: "internal-1" }]);

		expect(row.id).toBe("s-abc"); // `key` is the id used to open the session, NOT sessionId
		expect(row.name).toBe("Q3 strategy"); // from `label`
		expect(row.color).toBe("#7A6AA0");
		expect(row.dept).toBe("general");
		expect(row.pod).toBe("—");
		expect(row.mine).toBe(true); // single-owner pod → every session is the caller's
		expect(row.subtitle).toBeUndefined();
		expect(row.unread).toBeUndefined();
	});

	it("falls back to id/sessionId and name/title aliases", () =>
	{
		expect(_MapSessionSummaries([{ id: "t1", name: "Q3" }])[0]).toMatchObject({ id: "t1", name: "Q3" });
		const [row] = _MapSessionSummaries([{ sessionId: "s9", title: "Pricing deck" }]);
		expect(row.id).toBe("s9");
		expect(row.name).toBe("Pricing deck");
	});

	it("prefers `key`/`label` over the older aliases when both are present", () =>
	{
		const [row] = _MapSessionSummaries([{ key: "k", id: "a", sessionId: "b", label: "canonical", name: "first", title: "second" }]);

		expect(row.id).toBe("k");
		expect(row.name).toBe("canonical");
	});

	it("treats a row as shared only when `mine` is explicitly false", () =>
	{
		expect(_MapSessionSummaries([{ key: "a" }])[0].mine).toBe(true);
		expect(_MapSessionSummaries([{ key: "a", mine: false }])[0].mine).toBe(false);
	});

	it("orders sessions by updatedAt, newest first", () =>
	{
		const mapped = _MapSessionSummaries([
			{ key: "old", updatedAt: 1000 },
			{ key: "new", updatedAt: 3000 },
			{ key: "mid", updatedAt: 2000 }
		]);
		expect(mapped.map((s) => s.id)).toEqual(["new", "mid", "old"]);
	});

	it("defaults the name to the id when no name/title is present", () =>
	{
		const [row] = _MapSessionSummaries([{ id: "t7" }]);

		expect(row.name).toBe("t7");
	});

	it("preserves provided optional fields", () =>
	{
		const [row] = _MapSessionSummaries([{ id: "t1", name: "n", color: "#fff", dept: "eng", subtitle: "sub", unread: 3, mine: true, pod: "alex.oc" }]);

		expect(row.color).toBe("#fff");
		expect(row.dept).toBe("eng");
		expect(row.subtitle).toBe("sub");
		expect(row.unread).toBe(3);
		expect(row.mine).toBe(true);
		expect(row.pod).toBe("alex.oc");
	});

	it("drops rows without a usable id", () =>
	{
		const mapped = _MapSessionSummaries([
			{ name: "no id" },
			{ id: "", name: "blank id" },
			{ id: "   ", name: "whitespace id" },
			null,
			"string",
			{ id: "keep", name: "kept" }
		]);

		expect(mapped).toHaveLength(1);
		expect(mapped[0].id).toBe("keep");
	});

	it("ignores a non-numeric unread value", () =>
	{
		const [row] = _MapSessionSummaries([{ id: "t1", unread: "5" }]);

		expect(row.unread).toBeUndefined();
	});
});
