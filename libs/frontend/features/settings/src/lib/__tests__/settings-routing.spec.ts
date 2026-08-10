import { describe, expect, it } from "vitest";

import { PERSONAL_SETTINGS_NAVIGATION, WORKSPACE_SETTINGS_NAVIGATION, _SettingsNavigationForUrl, _SettingsScopeFromUrl } from "../settings-navigation.js";
import { SettingsScope, SettingsSectionId } from "../settings-navigation.types.js";
import { SETTINGS_ROUTES } from "../settings.routes.js";

/** Return the settings shell's child routes. */
function _shellChildren()
{
	return SETTINGS_ROUTES[0]?.children ?? [];
}

/** Return the children declared for one settings scope. */
function _scopeChildren(scope: SettingsScope)
{
	return _shellChildren().find(function findScope(route): boolean { return route.path === scope; })?.children ?? [];
}

describe("settings navigation contract", function settingsNavigationSuite(): void
{
	it("starts workspace settings with the contract-backed Models section", function workspaceNavigation(): void
	{
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function identity(item): SettingsSectionId { return item.id; })).toEqual([
			SettingsSectionId.Models,
			SettingsSectionId.Members,
			SettingsSectionId.Budgets,
			SettingsSectionId.Capabilities,
			SettingsSectionId.Connectors,
			SettingsSectionId.Agents,
			SettingsSectionId.DataNetwork
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function label(item): string { return item.label; })).toEqual([
			"Models", "Members", "Budgets", "Skills", "Connectors", "Agents", "Data & Network"
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION[0]?.route).toBe("/settings/workspace/models");
	});

	it("keeps personal Account as the first signed-in settings section", function personalNavigation(): void
	{
		expect(PERSONAL_SETTINGS_NAVIGATION[0]).toMatchObject({
			id: SettingsSectionId.Account,
			label: "Account",
			route: "/settings/personal/account"
		});
	});

	it("derives visible navigation from the routed scope", function navigationScope(): void
	{
		expect(_SettingsScopeFromUrl("/settings/workspace/models")).toBe(SettingsScope.Workspace);
		expect(_SettingsScopeFromUrl("/settings/personal/account")).toBe(SettingsScope.Personal);
		expect(_SettingsNavigationForUrl("/settings/workspace/models")).toBe(WORKSPACE_SETTINGS_NAVIGATION);
		expect(_SettingsNavigationForUrl("/settings/personal/account")).toBe(PERSONAL_SETTINGS_NAVIGATION);
	});
});

describe("settings route contract", function settingsRoutesSuite(): void
{
	it("routes Settings to Account first and Workspace to Models first", function routeDefaults(): void
	{
		const shellChildren = _shellChildren();
		const workspace = _scopeChildren(SettingsScope.Workspace);
		const personal = _scopeChildren(SettingsScope.Personal);

		expect(shellChildren[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "personal/account" });
		expect(shellChildren.at(-1)).toMatchObject({ path: "**", redirectTo: "personal/account" });
		expect(workspace[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "models" });
		expect(workspace.at(-1)).toMatchObject({ path: "**", redirectTo: "models" });
		expect(personal[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "account" });
		expect(personal.at(-1)).toMatchObject({ path: "**", redirectTo: "account" });
	});

	it("removes the old Pod leaf and keeps unsupported leaves explicit", function routeLeaves(): void
	{
		const workspaceRoutes = _scopeChildren(SettingsScope.Workspace);
		expect(workspaceRoutes.slice(1, -1).map(function path(route): string | undefined { return route.path; })).toEqual([
			"models", "members", "budgets", "skills", "connectors", "agents", "data-network", "provider-keys"
		]);
		expect(workspaceRoutes.some(function oldPod(route): boolean { return route.path === "pod"; })).toBe(false);
		expect(workspaceRoutes.find(function providerKeys(route): boolean { return route.path === "provider-keys"; })?.redirectTo).toBe("models");
		expect(workspaceRoutes.find(function members(route): boolean { return route.path === "members"; })?.data?.["title"]).toBe("Members");
		expect(_scopeChildren(SettingsScope.Personal).slice(1, -1).map(function path(route): string | undefined { return route.path; })).toEqual([
			"account", "awareness", "budget", "api-keys"
		]);
	});
});
