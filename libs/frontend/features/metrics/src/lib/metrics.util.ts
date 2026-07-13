import { MetricsDailyRow, MetricsSummary } from "./metrics.types";

/**
 * Converts a range string to its equivalent duration in milliseconds.
 *
 * @param range - The selected date range.
 * @returns Duration in milliseconds.
 */
export function _RangeToMs(range: "7d" | "30d" | "90d"): number
{
	switch (range)
	{
		case "7d":  return 7  * 24 * 60 * 60 * 1000;
		case "30d": return 30 * 24 * 60 * 60 * 1000;
		case "90d": return 90 * 24 * 60 * 60 * 1000;
	}
}

/**
 * Builds the JSON query string forwarded verbatim to the Langfuse metrics proxy.
 *
 * @param range - The selected date range.
 * @returns Serialised JSON string with `fromTimestamp` and `toTimestamp`.
 */
export function _BuildQuery(range: "7d" | "30d" | "90d"): string
{
	const to   = new Date();
	const from = new Date(to.getTime() - _RangeToMs(range));
	return JSON.stringify({
		fromTimestamp: from.toISOString(),
		toTimestamp:   to.toISOString(),
	});
}

/**
 * Parses the loosely-typed Langfuse response body into a typed row array.
 *
 * @param body - Raw response object from the metrics proxy.
 * @returns Array of normalised daily rows; missing fields default to `0`/`""`.
 */
export function _ParseRows(body: Record<string, unknown>): MetricsDailyRow[]
{
	const raw = Array.isArray(body["data"]) ? body["data"] : [];
	return (raw as Record<string, unknown>[]).map(function parseRow(r): MetricsDailyRow
	{
		const usage = r["usage"] && typeof r["usage"] === "object"
			? r["usage"] as Record<string, unknown>
			: {};
		return {
			date:              typeof r["date"]              === "string" ? r["date"] : "",
			countTraces:       typeof r["countTraces"]       === "number" ? r["countTraces"] : 0,
			countObservations: typeof r["countObservations"] === "number" ? r["countObservations"] : 0,
			totalCost:         typeof r["totalCost"]         === "number" ? r["totalCost"] : 0,
			inputTokens:       typeof usage["input"]         === "number" ? usage["input"] : 0,
			outputTokens:      typeof usage["output"]        === "number" ? usage["output"] : 0,
			totalTokens:       typeof usage["total"]         === "number" ? usage["total"] : 0,
		};
	});
}

/**
 * Reduces a row array into a single summary of period totals.
 *
 * @param rows - Normalised daily rows.
 * @returns Aggregated `MetricsSummary`.
 */
export function _Summarise(rows: MetricsDailyRow[]): MetricsSummary
{
	return rows.reduce(function sum(acc, r): MetricsSummary
	{
		return {
			totalTraces:       acc.totalTraces       + r.countTraces,
			totalObservations: acc.totalObservations + r.countObservations,
			totalCost:         acc.totalCost         + r.totalCost,
			totalTokens:       acc.totalTokens       + r.totalTokens,
		};
	}, { totalTraces: 0, totalObservations: 0, totalCost: 0, totalTokens: 0 });
}
