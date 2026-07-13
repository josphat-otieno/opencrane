import { definePreset } from "@primeng/themes";
import Aura from "@primeng/themes/aura";

/** Brand terracotta accent (matches --accent / --ring design tokens). */
const WO_ACCENT = "#c84b31";

/** Slightly darkened terracotta for hover states. */
const WO_ACCENT_HOVER = "#b8442c";

/**
 * WeOwnAI PrimeNG preset.
 *
 * Extends Aura and recolours the ToggleSwitch checked track to the brand
 * terracotta accent. The global `--primary` stays near-black (used by primary
 * buttons in the design), so only the switch is overridden here rather than the
 * whole primary palette.
 */
export const WeOwnAiPreset = definePreset(Aura,
{
	components:
	{
		toggleswitch:
		{
			colorScheme:
			{
				light:
				{
					root:
					{
						checkedBackground: WO_ACCENT,
						checkedHoverBackground: WO_ACCENT_HOVER,
						checkedBorderColor: WO_ACCENT,
						checkedHoverBorderColor: WO_ACCENT_HOVER
					},
					handle:
					{
						checkedColor: WO_ACCENT,
						checkedHoverColor: WO_ACCENT_HOVER
					}
				}
			}
		}
	}
});
