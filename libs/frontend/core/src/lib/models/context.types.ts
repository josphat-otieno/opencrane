import { ScopeLevel } from "./scope.types";

/** A scope dataset row in the context panel's retrieved-scope rail. */
export interface ScopeContextEntry
{
	/** Scope level of the dataset. */
	level: ScopeLevel;
	/** Dataset label (e.g. "acme-corp"). */
	label: string;
	/** Secondary description line. */
	sublabel: string;
	/** Whether the dataset is active for this session. */
	active: boolean;
	/** Freshness indicator (e.g. "4m ago", "live"). */
	freshness: string;
	/** Citations contributed to the current thread. */
	citationCount: number;
	/** Scope accent colour. */
	color: string;
}

/** A retrieved citation snippet shown under an expanded scope. */
export interface ScopeCitation
{
	/** Stable citation id. */
	id: string;
	/** Scope the citation came from. */
	scope: ScopeLevel;
	/** Source identifier (file, channel, wiki). */
	source: string;
	/** Cited snippet text. */
	snippet: string;
	/** Freshness indicator. */
	freshness: string;
}

/** An active skill row in the context panel. */
export interface ActiveSkill
{
	/** Skill name. */
	name: string;
	/** Scope the skill is granted at. */
	scope: ScopeLevel;
	/** Skill version string ("local" for unpublished). */
	version: string;
	/** Whether the skill is active. */
	active: boolean;
}

/** A ledger trace entry in the context panel's Ledger tab. */
export interface LedgerEntry
{
	/** Entry id (e.g. "R1", "P1", "A1"). */
	id: string;
	/** Entry kind ("observation" | "policy" | "action"). */
	type: string;
	/** Knowledge scope of the entry. */
	scope: ScopeLevel;
	/** Entry label. */
	label: string;
	/** Source reference. */
	ref: string;
	/** Entry status, or null when open. */
	status: string | null;
}

/** A key initiative row in the canvas document table. */
export interface CanvasInitiative
{
	/** Initiative name. */
	name: string;
	/** Owning team. */
	owner: string;
	/** Target outcome. */
	target: string;
	/** Timeline window. */
	timeline: string;
	/** Status key ("on-track" | "at-risk" | "pending"). */
	status: string;
}

/** A growth-target metric row in the canvas document. */
export interface CanvasMetric
{
	/** Metric label. */
	label: string;
	/** Metric value. */
	value: string;
	/** Supporting note. */
	note: string;
}

/** A risk row in the canvas document. */
export interface CanvasRisk
{
	/** Risk description. */
	risk: string;
	/** Severity key ("high" | "medium"). */
	severity: string;
}
