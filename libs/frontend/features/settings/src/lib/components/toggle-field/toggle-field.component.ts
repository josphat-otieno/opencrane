import { ChangeDetectionStrategy, Component, input, linkedSignal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ToggleSwitchModule } from "primeng/toggleswitch";

/** PrimeNG toggle switch with an optional muted label. */
@Component({
	selector: "wo-toggle-field",
	standalone: true,
	imports: [FormsModule, ToggleSwitchModule],
	templateUrl: "./toggle-field.component.html",
	styleUrl: "./toggle-field.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToggleFieldComponent
{
	/** Initial on/off state. */
	public readonly defaultOn = input<boolean>(false);

	/** Optional label to the right of the switch. */
	public readonly label = input<string | undefined>(undefined);

	/** On/off value, seeded from defaultOn and toggled locally thereafter. */
	public readonly value = linkedSignal<boolean>(() => this.defaultOn());
}
