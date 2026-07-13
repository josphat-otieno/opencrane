/** The selectable date range for the metrics query. */
export type MetricsRange = "7d" | "30d" | "90d";

/** One day's worth of aggregated AI usage as returned by the Langfuse proxy. */
export interface MetricsDailyRow
{
	/** ISO date string for this bucket (e.g. `"2025-06-01"`). */
	date: string;

	/** Number of top-level traces for the day. */
	countTraces: number;

	/** Number of observations (spans / generations) for the day. */
	countObservations: number;

	/** Total LLM cost in USD for the day. */
	totalCost: number;

	/** Total input tokens for the day. */
	inputTokens: number;

	/** Total output tokens for the day. */
	outputTokens: number;

	/** Total tokens (input + output) for the day. */
	totalTokens: number;
}

/** Aggregated totals across all rows in the selected range. */
export interface MetricsSummary
{
	/** Sum of traces across the period. */
	totalTraces: number;

	/** Sum of observations across the period. */
	totalObservations: number;

	/** Sum of cost in USD across the period. */
	totalCost: number;

	/** Sum of tokens across the period. */
	totalTokens: number;
}
