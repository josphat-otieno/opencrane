import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/** Root shell component; renders the active route container. */
@Component({
	selector: "wo-root",
	standalone: true,
	imports: [RouterOutlet],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent
{
}
