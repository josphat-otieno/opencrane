/** Notification categories with distinct icon/colour treatments. */
export enum NotificationKind
{
	/** Skill lifecycle events. */
	Skill = "skill",
	/** Automation run events. */
	Run = "run",
	/** Awareness contract events. */
	Contract = "contract",
	/** Budget threshold events. */
	Budget = "budget",
	/** Knowledge harvest events. */
	Harvest = "harvest",
	/** Access policy events. */
	Policy = "policy"
}

/** A notification row in the notification panel. */
export interface AppNotification
{
	/** Stable notification id. */
	id: string;
	/** Notification kind. */
	type: NotificationKind;
	/** Whether the user has read it. */
	read: boolean;
	/** Headline. */
	title: string;
	/** Body copy. */
	body: string;
	/** Relative timestamp. */
	time: string;
	/** Optional call-to-action label. */
	action?: string;
}

/** Visual treatment for a notification kind. */
export interface NotificationKindStyle
{
	/** PrimeIcons class for the kind icon. */
	icon: string;
	/** Accent colour. */
	color: string;
}

/** Notification kind → icon + colour. */
export const NOTIFICATION_KIND_STYLES: Record<NotificationKind, NotificationKindStyle> =
{
	[NotificationKind.Skill]: { icon: "pi pi-bolt", color: "#7A6AA0" },
	[NotificationKind.Run]: { icon: "pi pi-refresh", color: "#5A8A5A" },
	[NotificationKind.Contract]: { icon: "pi pi-book", color: "#4A6B8A" },
	[NotificationKind.Budget]: { icon: "pi pi-exclamation-triangle", color: "#A0855A" },
	[NotificationKind.Harvest]: { icon: "pi pi-refresh", color: "#5A8A7A" },
	[NotificationKind.Policy]: { icon: "pi pi-shield", color: "#C84B31" }
};
