/** Knowledge scope levels used across sessions, context, skills, and datasets. */
export enum ScopeLevel
{
	/** Organisation-wide scope. */
	Org = "org",
	/** Department scope. */
	Dept = "dept",
	/** Project scope. */
	Project = "project",
	/** Personal pod scope. */
	Personal = "personal"
}

/** Scope accent colour per level (mirrors the design token palette). */
export const SCOPE_COLORS: Record<ScopeLevel, string> =
{
	[ScopeLevel.Org]: "#5A8A5A",
	[ScopeLevel.Dept]: "#7A6AA0",
	[ScopeLevel.Project]: "#4A6B8A",
	[ScopeLevel.Personal]: "#C84B31"
};

/** Department metadata shown on session rows and chips. */
export interface DepartmentInfo
{
	/** Human-readable department label. */
	label: string;
	/** Department accent colour. */
	color: string;
}

/** Department key → display metadata for the demo org. */
export const DEPARTMENTS: Record<string, DepartmentInfo> =
{
	eng: { label: "Engineering", color: "#4A6B8A" },
	product: { label: "Product", color: "#7A6AA0" },
	marketing: { label: "Marketing", color: "#A0855A" },
	finance: { label: "Finance", color: "#5A8A7A" }
};
