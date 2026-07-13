import { describe, expect, it } from "vitest";

import { _WoA2uiTheme } from "../a2ui.theme";

describe("_WoA2uiTheme", () =>
{
	const theme = _WoA2uiTheme();

	it("maps key components onto WeOwnAI design tokens via additionalStyles", () =>
	{
		expect(theme.additionalStyles?.Card?.["background"]).toBe("var(--card)");
		expect(theme.additionalStyles?.Button?.["background"]).toBe("var(--primary)");
		expect(theme.additionalStyles?.Divider?.["border-top"]).toContain("var(--border)");
	});

	it("themes Text typography per usage hint (body + headings) with tokens", () =>
	{
		const text = theme.additionalStyles?.Text as Record<string, Record<string, string>> | undefined;
		expect(text?.["body"]?.["color"]).toBe("var(--foreground)");
		expect(text?.["h1"]?.["font-size"]).toBe("18px");
	});

	it("leaves the class-map + markdown channels empty (markdown flows through our pipeline)", () =>
	{
		expect(theme.components.Button).toEqual({});
		expect(theme.markdown.p).toEqual([]);
	});
});
