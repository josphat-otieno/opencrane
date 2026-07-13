import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { LEDGER_KIND_STYLES, LedgerKindStyle, SCOPE_COLORS, ScopeLevel } from "@opencrane/core";
import { ScopeChipComponent } from "../scope-chip/scope-chip.component";

/** Observation / policy / action ledger card (used in chat and ledger tab). */
@Component({
	selector: "wo-ledger-card",
	standalone: true,
	imports: [ScopeChipComponent],
	templateUrl: "./ledger-card.component.html",
	styleUrl: "./ledger-card.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LedgerCardComponent
{
	/** Entry id (e.g. "R1"). */
	public readonly entryId = input.required<string>();

	/** Entry kind ("observation" | "policy" | "action"). */
	public readonly kind = input.required<string>();

	/** Entry label text. */
	public readonly label = input.required<string>();

	/** Knowledge scope of the entry. */
	public readonly scope = input<ScopeLevel | undefined>(undefined);

	/** Source reference. */
	public readonly entryRef = input<string | undefined>(undefined);

	/** Entry status chip text. */
	public readonly status = input<string | null | undefined>(undefined);

	/** Dim the label (resolved entries). */
	public readonly dimmed = input<boolean>(false);

	/** Visual style for the current kind (memoised). */
	public readonly style = computed<LedgerKindStyle>(() => LEDGER_KIND_STYLES[this.kind()] ?? LEDGER_KIND_STYLES["observation"]);

	/** Scope accent colour for the scope chip (memoised). */
	public readonly scopeColor = computed<string>(() =>
	{
		const level = this.scope();
		return level ? SCOPE_COLORS[level] : "var(--muted-foreground)";
	});
}
