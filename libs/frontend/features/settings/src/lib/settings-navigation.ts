import { SettingsNavigationItem, SettingsScope, SettingsSectionId } from "./settings-navigation.types.js";

/** Workspace settings navigation in the authoritative handoff order. */
export const WORKSPACE_SETTINGS_NAVIGATION: readonly SettingsNavigationItem[] =
[
	{ id: SettingsSectionId.Models, label: "Models", route: "/settings/workspace/models", iconPath: "M6.5 9.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm3.5-.5 5 5" },
	{ id: SettingsSectionId.Members, label: "Members", route: "/settings/workspace/members", iconPath: "M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 13c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" },
	{ id: SettingsSectionId.Budgets, label: "Budgets", route: "/settings/workspace/budgets", iconPath: "M8 3v10M5.5 5.5h3.5a2 2 0 0 1 0 4H5.5" },
	{ id: SettingsSectionId.Capabilities, label: "Skills", route: "/settings/workspace/skills", iconPath: "M9.5 2.5L6 9.5h4.5L7 14 13 7h-4.5z" },
	{ id: SettingsSectionId.Connectors, label: "Connectors", route: "/settings/workspace/connectors", iconPath: "M5.5 2.5v4a2.5 2.5 0 0 0 5 0v-4M5.5 2.5h5M8 9v2.5M8 11.5v2" },
	{ id: SettingsSectionId.Agents, label: "Agents", route: "/settings/workspace/agents", iconPath: "M8 8.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM3.5 3.5l3.2 3.6M12.5 3.5l-3.2 3.6M8 9.5V13" },
	{ id: SettingsSectionId.DataNetwork, label: "Data & Network", route: "/settings/workspace/data-network", iconPath: "M8 2l-6 3.5v5L8 14l6-3.5v-5zm0 0v12M2 5.5l6 3.5 6-3.5" }
];

/** Personal settings navigation in the authoritative handoff order. */
export const PERSONAL_SETTINGS_NAVIGATION: readonly SettingsNavigationItem[] =
[
	{ id: SettingsSectionId.Account, label: "Account", route: "/settings/personal/account", iconPath: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6c0-2.761 2.239-5 5-5s5 2.239 5 5" },
	{ id: SettingsSectionId.Awareness, label: "Awareness", route: "/settings/personal/awareness", iconPath: "M2 6.5h12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm4-3v3M8 3.5v3M12 3.5v3M8 10v2" },
	{ id: SettingsSectionId.PersonalBudget, label: "My Budget", route: "/settings/personal/budget", iconPath: "M8 3v10M5.5 5.5h3.5a2 2 0 0 1 0 4H5.5" },
	{ id: SettingsSectionId.PersonalApiKeys, label: "API Keys", route: "/settings/personal/api-keys", iconPath: "M6.5 9.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm3.5-.5 5 5" }
];

/** Resolve the settings scope represented by a router URL. */
export function _SettingsScopeFromUrl(url: string): SettingsScope
{
	return url.startsWith("/settings/personal") ? SettingsScope.Personal : SettingsScope.Workspace;
}

/** Return the navigation group represented by a router URL. */
export function _SettingsNavigationForUrl(url: string): readonly SettingsNavigationItem[]
{
	return _SettingsScopeFromUrl(url) === SettingsScope.Personal ? PERSONAL_SETTINGS_NAVIGATION : WORKSPACE_SETTINGS_NAVIGATION;
}
