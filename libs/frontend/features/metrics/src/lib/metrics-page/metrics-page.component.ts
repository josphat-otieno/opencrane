import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { MessageModule } from "primeng/message";

import { ControlPlaneApiService } from "@opencrane/core";

import { MetricsDailyRow, MetricsRange, MetricsSummary } from "../metrics.types";
import { _BuildQuery, _ParseRows, _Summarise } from "../metrics.util";

/** Internal load-state discriminant — narrows template branches without magic strings. */
type LoadState = "idle" | "loading" | "loaded" | "error";

function _HttpErrorMessage(status: number, error: unknown): string
{
	switch (status)
	{
		case 503: return "Metrics backend (Langfuse) is not configured on this instance.";
		case 502: return "Langfuse backend was unreachable. Try again in a moment.";
		case 403: return "You do not have access to metrics on this instance.";
	}
	const e = error as Record<string, unknown> | null;
	if (e && typeof e["error"] === "string" && e["error"]) return e["error"];
	return "Failed to load metrics.";
}

/**
 * Full-page metrics dashboard for platform operators.
 *
 * Fetches AI usage data from the Langfuse proxy (`/model-routing/metrics`) for
 * a selectable date range, derives per-period summary totals via `computed`, and
 * renders both a summary row and a sortable per-day table.  All mutations go
 * through the `_fetch` private method so the template stays declarative.
 */
@Component({
	selector: "wo-metrics-page",
	standalone: true,
	imports: [ButtonModule, TableModule, MessageModule],
	templateUrl: "./metrics-page.component.html",
	styleUrl: "./metrics-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsPageComponent
{
	/** Typed opencrane-ui HTTP client. */
	private readonly _api = inject(ControlPlaneApiService);

	/** Currently selected date range. */
	public readonly range = signal<MetricsRange>("30d");

	/** Async load state; drives which template branch is visible. */
	public readonly state = signal<LoadState>("idle");

	/** Raw daily rows returned by the last successful fetch. */
	public readonly rows = signal<MetricsDailyRow[]>([]);

	/** Human-readable error message when `state() === "error"`. */
	public readonly errorMsg = signal<string | null>(null);

	/** Aggregated period totals derived from the current `rows`. */
	public readonly summary = computed<MetricsSummary>(() => _Summarise(this.rows()));

	/** `true` while a network request is in flight. */
	public readonly loading = computed(() => this.state() === "loading");

	/** `true` when the last request ended in an error. */
	public readonly hasError = computed(() => this.state() === "error");

	/** `true` when rows are available to render. */
	public readonly hasData = computed(() => this.state() === "loaded");

	public constructor()
	{
		void this._fetch("30d");
	}

	/**
	 * Switch the active range and re-fetch.
	 *
	 * @param r - The range selected by the user.
	 */
	public selectRange(r: MetricsRange): void
	{
		this.range.set(r);
		void this._fetch(r);
	}

	/**
	 * Fetches metrics for the given range and writes the result into signals.
	 * Errors are caught here so the template never sees a thrown promise.
	 *
	 * @param r - The range to query.
	 */
	private async _fetch(r: MetricsRange): Promise<void>
	{
		this.state.set("loading");
		this.errorMsg.set(null);
		try
		{
			const { data, error, response } = await this._api.client.GET("/model-routing/metrics", {
				params: { query: { query: _BuildQuery(r) } },
			});
			if (!response.ok)
			{
				this.state.set("error");
				this.errorMsg.set(_HttpErrorMessage(response.status, error));
				return;
			}
			this.rows.set(_ParseRows((data ?? {}) as Record<string, unknown>));
			this.state.set("loaded");
		}
		catch
		{
			this.state.set("error");
			this.errorMsg.set("Failed to load metrics.");
		}
	}
}
