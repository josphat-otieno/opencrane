import { Routes } from "@angular/router";

/** Lazy route table for the metrics dashboard feature. */
export const METRICS_ROUTES: Routes = [
	{
		path: "",
		loadComponent: function loadMetricsPage()
		{
			return import("./metrics-page/metrics-page.component").then(function pickMetricsPage(m)
			{
				return m.MetricsPageComponent;
			});
		}
	}
];
