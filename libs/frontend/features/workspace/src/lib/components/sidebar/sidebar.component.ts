import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { AutomationRun, DEPARTMENTS, DepartmentInfo, SessionSummary } from "@opencrane/core";
import { CONVERSATION_GATEWAY, SessionStore } from "@opencrane/state/core";
import { AvatarCircleComponent, CollapsibleSectionComponent } from "@opencrane/elements/ui";
import { SessionRowComponent } from "../session-row/session-row.component";
import { TenantSwitcherComponent } from "../tenant-switcher/tenant-switcher.component";

/** Dark navigation rail: sessions, automation runs, notifications, settings, user. */
@Component({
	selector: "wo-sidebar",
	standalone: true,
	imports: [CollapsibleSectionComponent, AvatarCircleComponent, SessionRowComponent, TenantSwitcherComponent, RouterLink, RouterLinkActive],
	templateUrl: "./sidebar.component.html",
	styleUrl: "./sidebar.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent
{
	/** Unread notification count for the bell badge. */
	public readonly unreadCount = input<number>(0);

	/** Emits when the bell button is clicked. */
	public readonly notificationsToggle = output<void>();

	/** Whether the search input is shown. */
	public readonly searchOpen = signal<boolean>(false);

	/** Conversation runtime; supplies the enumerable session list. */
	private readonly _gateway = inject(CONVERSATION_GATEWAY);

	/**
	 * All sessions enumerated from the gateway. Read reactively from the gateway
	 * signal (refreshed whenever the socket opens), NOT a one-shot fetch — the
	 * connection is usually not up yet when the sidebar first renders.
	 */
	private readonly _sessions = this._gateway.sessions;

	/** Sessions owned by the current user. */
	public readonly mySessions = computed<SessionSummary[]>(() => this._sessions().filter(function isMine(s: SessionSummary): boolean { return s.mine; }));

	/** Sessions shared with the current user. */
	public readonly sharedSessions = computed<SessionSummary[]>(() => this._sessions().filter(function isShared(s: SessionSummary): boolean { return !s.mine; }));

	/** Automation runs — empty until a live gateway endpoint exists. */
	public readonly automationRuns: AutomationRun[] = [];

	/** App-wide identity state. */
	private readonly _session = inject(SessionStore);

	/** Whether a opencrane-ui session is established (gates the logout button). */
	public readonly authenticated = this._session.authenticated;

	/** Display name of the signed-in user. */
	public readonly userName = computed<string>(() => this._session.displayName() ?? "");

	/** "pod · department" footer line. */
	public readonly userPod = computed<string>(() =>
	{
		const tenant = this._session.currentTenant();
		return tenant ? `${tenant.name} · ${tenant.email}` : "";
	});

	/** Two-letter avatar initials derived from the user name. */
	public readonly userInitials = computed<string>(() =>
	{
		const parts = this.userName().split(" ").filter(Boolean);
		return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
	});

	/**
	 * Bring the gateway connection up so the sidebar's {@link mySessions} fill in.
	 * The list itself is read reactively from `gateway.sessions` (refreshed on every
	 * socket open), so a one-shot fetch here would just race the handshake.
	 */
	public constructor()
	{
		this._gateway.ensureConnected();
	}

	/** Resolves department metadata for a key, if known. */
	public department(key: string): DepartmentInfo | undefined
	{
		return DEPARTMENTS[key];
	}

	/** Sign the current user out of the opencrane-ui session. */
	public logout(): void
	{
		void this._session.logout();
	}
}
