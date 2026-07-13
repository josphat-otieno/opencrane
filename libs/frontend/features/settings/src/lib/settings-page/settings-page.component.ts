import { ChangeDetectionStrategy, Component, signal } from "@angular/core";

import { SETTINGS_NAV, SettingsNavItem, SettingsSection } from "@opencrane/core";
import { PodSectionComponent } from "../sections/pod-section/pod-section.component";
import { ModelBudgetSectionComponent } from "../sections/model-budget-section/model-budget-section.component";
import { AwarenessSectionComponent } from "../sections/awareness-section/awareness-section.component";
import { SkillsSectionComponent } from "../sections/skills-section/skills-section.component";
import { ChannelsSectionComponent } from "../sections/channels-section/channels-section.component";
import { AccessSectionComponent } from "../sections/access-section/access-section.component";
import { NetworkSectionComponent } from "../sections/network-section/network-section.component";
import { AccountSectionComponent } from "../sections/account-section/account-section.component";

/** Settings view: section nav + active section content. */
@Component({
	selector: "wo-settings-page",
	standalone: true,
	imports:
	[
		PodSectionComponent,
		ModelBudgetSectionComponent,
		AwarenessSectionComponent,
		SkillsSectionComponent,
		ChannelsSectionComponent,
		AccessSectionComponent,
		NetworkSectionComponent,
		AccountSectionComponent
	],
	templateUrl: "./settings-page.component.html",
	styleUrl: "./settings-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPageComponent
{
	/** Section enum for the template. */
	public readonly sections = SettingsSection;

	/** Settings navigation items. */
	public readonly nav: SettingsNavItem[] = SETTINGS_NAV;

	/** Active section. */
	public readonly active = signal<SettingsSection>(SettingsSection.Pod);
}
