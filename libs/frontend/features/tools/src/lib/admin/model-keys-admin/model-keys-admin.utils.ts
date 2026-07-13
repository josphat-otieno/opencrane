import { ModelProvider, ProviderKeyStatus, SUPPORTED_MODEL_PROVIDERS } from "@opencrane/state/provider-key/adapter";

import { LiteLlmBadge, MODEL_PROVIDER_LABELS, ModelKeyRow } from "./model-keys-admin.types";

/**
 * Project the gateway's status list onto the full set of provider rows.
 *
 * The supported-provider list is closed and always rendered, so a provider
 * absent from `statuses` becomes an unconfigured row. Rows follow
 * {@link SUPPORTED_MODEL_PROVIDERS} display order, independent of server order.
 *
 * @param statuses - Per-provider status from the gateway.
 */
export function _ToModelKeyRows(statuses: ProviderKeyStatus[]): ModelKeyRow[]
{
	const byProvider = new Map<ModelProvider, ProviderKeyStatus>(statuses.map(function entry(status: ProviderKeyStatus): [ModelProvider, ProviderKeyStatus]
	{
		return [status.provider, status];
	}));
	return SUPPORTED_MODEL_PROVIDERS.map(function toRow(provider: ModelProvider): ModelKeyRow
	{
		const status = byProvider.get(provider);
		const updatedAt = status?.updatedAt ?? null;
		return {
			provider,
			label: MODEL_PROVIDER_LABELS[provider],
			configured: status?.configured ?? false,
			litellmRegistered: status?.litellmRegistered ?? false,
			updatedAt,
			updatedAtLabel: _FormatUpdatedAt(updatedAt)
		};
	});
}

/**
 * Format an ISO timestamp as a short local date, or "—" when absent/invalid.
 *
 * @param iso - The ISO-8601 timestamp from the gateway, or null.
 */
export function _FormatUpdatedAt(iso: string | null): string
{
	if (!iso)
	{
		return "—";
	}
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime()))
	{
		return "—";
	}
	return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Map a row's configured/registered state onto its LiteLLM badge.
 *
 * @param row - The provider row to classify.
 */
export function _BadgeFor(row: ModelKeyRow): LiteLlmBadge
{
	if (!row.configured)
	{
		return LiteLlmBadge.None;
	}
	return row.litellmRegistered ? LiteLlmBadge.Active : LiteLlmBadge.SecretOnly;
}
