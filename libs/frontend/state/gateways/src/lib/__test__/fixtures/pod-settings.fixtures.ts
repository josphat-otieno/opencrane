import { SettingsMutation, SettingsMutationFixture, SettingsMutationOutcome } from "@opencrane/core";
import { PodSettingsDraftFixture, PodSettingsFixture } from "@opencrane/state/settings/adapter";

/** Authoritative visible values from the Workspace Pod handoff. */
export const POD_SETTINGS_FIXTURE: PodSettingsFixture =
{
	podId: "elewa-default",
	latestVersion: "2026.5.28",
	storageStats:
	[
		{ label: "Used", value: "2.3 GB" },
		{ label: "Quota", value: "20 GB" },
		{ label: "Encrypted", value: "AES-256" }
	],
	draft:
	{
		displayName: "Elewa Group workspace",
		version: "2026.3.15",
		autoUpdate: true
	}
};

/** Repeatable mounted-screen success boundary that accepts the captured draft. */
export const POD_SETTINGS_SUCCESS_MUTATION: SettingsMutation<PodSettingsDraftFixture> =
{
	mutate: function acceptPodSettings(draft: PodSettingsDraftFixture)
	{
		return Promise.resolve({ outcome: SettingsMutationOutcome.Success, accepted: structuredClone(draft), message: "Pod settings saved." });
	}
};

/** Successful fixture that accepts the submitted Pod draft. */
export function _PodSettingsSuccessFixture(draft: PodSettingsDraftFixture): SettingsMutationFixture<PodSettingsDraftFixture>
{
	return { result: { outcome: SettingsMutationOutcome.Success, accepted: draft, message: "Pod settings saved." } };
}

/** Conflict fixture that exposes a newer stored Pod draft. */
export const POD_SETTINGS_CONFLICT_FIXTURE: SettingsMutationFixture<PodSettingsDraftFixture> =
{
	result:
	{
		outcome: SettingsMutationOutcome.Conflict,
		latest: { displayName: "Elewa workspace", version: "2026.5.28", autoUpdate: true },
		message: "Pod settings changed elsewhere. Reload the latest values or return to editing."
	}
};

/** Recoverable fixture that preserves the submitted Pod draft for retry. */
export const POD_SETTINGS_ERROR_FIXTURE: SettingsMutationFixture<PodSettingsDraftFixture> =
{
	result: { outcome: SettingsMutationOutcome.RecoverableError, message: "Pod settings could not be saved. Try again." }
};

/** Delayed success fixture used to make the pending lock deterministic. */
export const POD_SETTINGS_DELAYED_SUCCESS_FIXTURE: SettingsMutationFixture<PodSettingsDraftFixture> =
{
	delayMilliseconds: 20,
	result: { outcome: SettingsMutationOutcome.Success, accepted: POD_SETTINGS_FIXTURE.draft, message: "Pod settings saved." }
};
