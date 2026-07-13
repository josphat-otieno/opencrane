import { AppNotification, NotificationKind } from "../../models/notification.types";

/** Demo notifications shown in the notification panel. */
export const NOTIFICATIONS: AppNotification[] =
[
	{ id: "n1", type: NotificationKind.Skill, read: false, title: "Skill promotion approved", body: "strategy-analyst v0.9.1 promoted from personal → dept by Maya Reyes.", time: "4m ago", action: "View skill" },
	{ id: "n2", type: NotificationKind.Budget, read: false, title: "Budget alert — 82% used", body: "alex.oc has consumed 82% of its monthly token budget. Resets Jul 1.", time: "31m ago", action: "Adjust budget" },
	{ id: "n3", type: NotificationKind.Contract, read: false, title: "Awareness contract updated", body: "Fleet rolled to contract v2.3.1. Shadow mode active for 24h before cutover.", time: "1h ago", action: "Review changes" },
	{ id: "n4", type: NotificationKind.Run, read: true, title: "Automation run completed", body: "Release notes v2.4 finished in 1m 12s. Output written to canvas.", time: "2h ago", action: "Open canvas" },
	{ id: "n5", type: NotificationKind.Harvest, read: true, title: "Harvest completed — Slack", body: "#product-leadership and #engineering indexed. 142 new entries in dept dataset.", time: "4h ago" },
	{ id: "n6", type: NotificationKind.Policy, read: true, title: "Access policy updated", body: "finance dataset membership added to your scope by org admin.", time: "yesterday" }
];
