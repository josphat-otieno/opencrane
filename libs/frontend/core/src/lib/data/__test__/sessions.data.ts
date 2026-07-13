import { AutomationRun, SessionSummary, ShareTarget, Teammate } from "../../models/session.types";

/** Demo sessions shown in the sidebar (mine + shared). */
export const SESSIONS: SessionSummary[] =
[
	{ id: "t1", name: "Q3 strategy draft", color: "#C84B31", dept: "product", subtitle: "3 decisions pending", unread: 2, mine: true, pod: "alex.oc" },
	{ id: "t2", name: "swift-harbour", color: "#5A8A7A", dept: "eng", subtitle: "Competitor analysis", mine: true, pod: "alex.oc" },
	{ id: "t3", name: "frame-orchard", color: "#7A6AA0", dept: "product", subtitle: "User interview synthesis", unread: 5, mine: true, pod: "alex.oc" },
	{ id: "t5", name: "weekly-tide", color: "#A0855A", dept: "marketing", subtitle: "Pricing page · weekly deck", mine: false, pod: "maya.oc" },
	{ id: "t6", name: "lend-meadow", color: "#4A6B8A", dept: "finance", subtitle: "Pacing supervisor · Lumeria", mine: false, pod: "tom.oc" }
];

/** Demo automation runs shown in the sidebar. */
export const AUTOMATION_RUNS: AutomationRun[] =
[
	{ id: "a1", name: "Release notes v2.4", status: "done", dept: "eng" },
	{ id: "a2", name: "Org knowledge harvest", status: "running", dept: "org" }
];

/** Demo teammates available in the share panel. */
export const TEAMMATES: Teammate[] =
[
	{ id: "u1", name: "Maya Reyes", dept: "Product", initials: "MR", color: "#7A6AA0" },
	{ id: "u2", name: "Tom Liang", dept: "Engineering", initials: "TL", color: "#4A6B8A" },
	{ id: "u3", name: "Sara Okonkwo", dept: "Design", initials: "SO", color: "#5A8A7A" },
	{ id: "u4", name: "Jake Morrow", dept: "Finance", initials: "JM", color: "#A0855A" },
	{ id: "u5", name: "Priya Nair", dept: "Marketing", initials: "PN", color: "#5A8A5A" }
];

/** Demo shared sessions a canvas can be sent to. */
export const SHARE_TARGETS: ShareTarget[] =
[
	{ id: "t5", name: "weekly-tide", dept: "Marketing" },
	{ id: "t6", name: "lend-meadow", dept: "Finance" }
];
