import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource } from "@angular/core";

import { SCOPE_COLORS, ScopeLevel, SkillRow } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ScopeChipComponent, SectionHeadingComponent } from "@opencrane/elements/ui";
import { _settledValue } from "../../resource.util";

/** Skills management settings section. */
@Component({
	selector: "wo-skills-section",
	standalone: true,
	imports: [SectionHeadingComponent, ScopeChipComponent],
	templateUrl: "./skills-section.component.html",
	styleUrl: "./skills-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillsSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Skill catalogue, loaded from the gateway (cluster-wide — no tenant key). */
	private readonly _skills = resource({
		loader: (): Promise<SkillRow[]> => this._gateway.getSkills()
	});

	/** Skill registry rows (empty until the gateway resolves). */
	public readonly skills: Signal<SkillRow[]> = computed((): SkillRow[] =>
	{
		return _settledValue(this._skills) ?? [];
	});

	/** Scope level for personal-scope checks in the template. */
	public readonly personalScope = ScopeLevel.Personal;

	/** Scope accent colour lookup. */
	public scopeColor(scope: ScopeLevel): string
	{
		return SCOPE_COLORS[scope];
	}
}
