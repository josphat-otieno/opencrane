/** Settings scopes represented by the routed settings shell. */
export enum SettingsScope
{
	/** Organization-owned workspace settings. */
	Workspace = "workspace",
	/** Settings owned by the signed-in person. */
	Personal = "personal"
}

/** Stable identities for every settings navigation destination. */
export enum SettingsSectionId
{
	/** Workspace model routing and provider key settings. */
	Models = "models",
	/** Workspace membership settings. */
	Members = "members",
	/** Workspace budget settings. */
	Budgets = "budgets",
	/** Scope-aware agent capabilities shown as Skills. */
	Capabilities = "capabilities",
	/** Installed external tools shown as Connectors. */
	Connectors = "connectors",
	/** Workspace agent configuration and messaging surfaces. */
	Agents = "agents",
	/** Workspace data-sovereignty and network settings. */
	DataNetwork = "data-network",
	/** Personal account settings. */
	Account = "account",
	/** Personal awareness settings. */
	Awareness = "awareness",
	/** Personal budget settings. */
	PersonalBudget = "budget",
	/** Personal API keys. */
	PersonalApiKeys = "api-keys"
}

/** A route-backed settings navigation item. */
export interface SettingsNavigationItem
{
	/** Stable identity independent from the visible label and URL segment. */
	readonly id: SettingsSectionId;
	/** Visible navigation label. */
	readonly label: string;
	/** Absolute route used for direct links and browser history. */
	readonly route: string;
	/** SVG path copied from the authoritative handoff package. */
	readonly iconPath: string;
}
