import { Routes } from "@angular/router";

import { SettingsPageComponent } from "./settings-page/settings-page.component.js";
import { SettingsPlaceholderComponent } from "./settings-placeholder/settings-placeholder.component.js";

/** Workspace-owned settings routes in the canonical navigation order. */
const WORKSPACE_SETTINGS_ROUTES: Routes =
[
	{ path: "", pathMatch: "full", redirectTo: "models" },
	{
		path: "models",
		loadComponent: function loadModelsSection()
		{
			return import("./sections/llm-providers-section/llm-providers-section.component.js").then(function pickModelsSection(module)
			{
				return module.LlmProvidersSectionComponent;
			});
		}
	},
		{
			path: "members",
			component: SettingsPlaceholderComponent,
			data: { title: "Members", description: "Workspace membership settings are waiting for a public settings contract." }
		},
		{
			path: "budgets",
			component: SettingsPlaceholderComponent,
			data: { title: "Budgets", description: "Workspace budget controls will appear when the budget settings contract is available." }
		},
		{
			path: "skills",
			component: SettingsPlaceholderComponent,
			data: { title: "Skills", description: "Skill settings are read-only until governed skill configuration is contract-backed." }
		},
		{
			path: "connectors",
			component: SettingsPlaceholderComponent,
			data: { title: "Tools", description: "Tool and connector settings will use the MCP gateway once the section contract is complete." }
		},
		{
			path: "agents",
			component: SettingsPlaceholderComponent,
			data: { title: "Agent", description: "Personal assistant configuration will appear after the public configuration contract is ready." }
		},
		{
			path: "data-network",
			component: SettingsPlaceholderComponent,
			data: { title: "Memory and knowledge", description: "Memory and retrieval-source controls require confirmed public memory contracts." }
		},
		{ path: "provider-keys", redirectTo: "models" },
		{ path: "**", redirectTo: "models" }
	];

/** Personal settings routes in the canonical navigation order. */
const PERSONAL_SETTINGS_ROUTES: Routes =
[
	{ path: "", pathMatch: "full", redirectTo: "account" },
	{
		path: "account",
		loadComponent: function loadAccountSection()
		{
			return import("./sections/account-section/account-section.component.js").then(function pickAccountSection(module)
			{
				return module.AccountSectionComponent;
			});
		}
	},
		{
			path: "awareness",
			component: SettingsPlaceholderComponent,
			data: { title: "Awareness", description: "Personal awareness settings are waiting for a public configuration contract." }
		},
		{
			path: "budget",
			component: SettingsPlaceholderComponent,
			data: { title: "My budget", description: "Personal budget status will appear when the spend settings contract is available." }
		},
		{
			path: "api-keys",
			component: SettingsPlaceholderComponent,
			data: { title: "API keys", description: "Personal API keys are unavailable until the account key contract is present." }
		},
	{ path: "**", redirectTo: "account" }
];

/** Routed settings feature mounted by the workspace at `/settings`. */
export const SETTINGS_ROUTES: Routes =
[
	{
		path: "",
		component: SettingsPageComponent,
		children:
		[
				{ path: "", pathMatch: "full", redirectTo: "personal/account" },
				{ path: "workspace", children: WORKSPACE_SETTINGS_ROUTES },
				{ path: "personal", children: PERSONAL_SETTINGS_ROUTES },
				{ path: "**", redirectTo: "personal/account" }
			]
		}
	];
