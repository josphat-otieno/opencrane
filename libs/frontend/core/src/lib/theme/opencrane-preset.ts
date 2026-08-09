import { definePreset } from "@primeng/themes";
import Aura from "@primeng/themes/aura";

/** Paper theme primary accent (matches --oc-teal). */
const OC_PRIMARY = "#0db5cc";

/** Brighter fold used by the hard-stop hover treatment. */
const OC_PRIMARY_HOVER = "#22c7dd";

/** Dark edge and accessible focus colour for primary controls. */
const OC_PRIMARY_EDGE = "#0a94a7";

/**
 * OpenCrane PrimeNG preset.
 *
 * Extends Aura with the semantic colours used by the OpenCrane Paper handoff.
 * Component-specific overrides stay here so PrimeNG controls and application
 * styles share the same surface, focus, and primary colour contracts.
 */
export const OpenCranePreset = definePreset(Aura,
{
	semantic:
	{
		primary:
		{
			50: "#e6f8fc",
			100: "#c4f0f7",
			200: "#9fe5ef",
			300: "#7ad9e7",
			400: OC_PRIMARY_HOVER,
			500: OC_PRIMARY,
			600: OC_PRIMARY_EDGE,
			700: "#087888",
			800: "#075f6c",
			900: "#054751",
			950: "#032f36"
		},
		focusRing:
		{
			width: "3px",
			style: "solid",
			color: OC_PRIMARY_EDGE,
			offset: "2px"
		},
		colorScheme:
		{
			light:
			{
				primary:
				{
					color: OC_PRIMARY,
					contrastColor: "#1a1918",
					hoverColor: OC_PRIMARY_HOVER,
					activeColor: OC_PRIMARY_EDGE
				},
				surface:
				{
					0: "#ffffff",
					50: "#fdfcfa",
					100: "#f5f2ec",
					200: "#ebe8e2",
					300: "#dedad2",
					400: "#d0cdc6",
					500: "#9a9690",
					600: "#6a6660",
					700: "#4a4845",
					800: "#2f2d2b",
					900: "#1a1918",
					950: "#141312"
				}
			}
		}
	},
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
						checkedBackground: OC_PRIMARY,
						checkedHoverBackground: OC_PRIMARY_HOVER,
						checkedBorderColor: OC_PRIMARY,
						checkedHoverBorderColor: OC_PRIMARY_HOVER
					},
					handle:
					{
						checkedColor: OC_PRIMARY,
						checkedHoverColor: OC_PRIMARY_HOVER
					}
				}
			}
		}
	}
});
