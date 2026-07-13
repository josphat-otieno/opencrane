import { ChangeDetectionStrategy, Component, computed, output } from "@angular/core";

import { AppNotification, NOTIFICATION_KIND_STYLES, NotificationKindStyle } from "@opencrane/core";

/** Notification popover anchored to the sidebar bell. */
@Component({
	selector: "wo-notification-panel",
	standalone: true,
	templateUrl: "./notification-panel.component.html",
	styleUrl: "./notification-panel.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationPanelComponent
{
	/** Emits when the panel should close. */
	public readonly closed = output<void>();

	/** Notification rows — empty until a live notifications gateway exists. */
	public readonly notifications: AppNotification[] = [];

	/** Count of unread notifications. */
	public readonly unreadCount = computed<number>(() => this.notifications.filter(function unread(n: AppNotification): boolean { return !n.read; }).length);

	/** Resolves icon + colour for a notification. */
	public kindStyle(notification: AppNotification): NotificationKindStyle
	{
		return NOTIFICATION_KIND_STYLES[notification.type];
	}
}
