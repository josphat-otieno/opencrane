import { Component, EventEmitter, Input, Output, type OnChanges, type SimpleChanges, signal } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MessageModule } from "primeng/message";

import type { DatasetMembership } from "../../../core/models/dataset-membership.model";
import type { DatasetMembershipSaveEvent } from "../../../core/models/dataset-membership-save-event.model";

/**
 * Reusable editor for tenant dataset memberships across org/team/project/personal scopes.
 */
@Component({
  selector: "oc-dataset-membership-editor",
  standalone: true,
  imports: [InputTextModule, ButtonModule, MessageModule],
  templateUrl: "./dataset-membership-editor.component.html",
})
export class DatasetMembershipEditorComponent implements OnChanges
{
  /** Current dataset membership values. */
  @Input({ required: true }) membership: DatasetMembership = { org: ["default"], team: [], project: [], personal: [] };

  /** Save button loading state. */
  @Input() saving = false;

  /** Disable editing interactions when memberships cannot be loaded safely. */
  @Input() disabled = false;

  /** Optional inline error message shown beneath the editor. */
  @Input() error: string | null = null;

  /** Optional inline success message shown beneath the editor. */
  @Input() success = false;

  /** Emits normalized membership payload when Save is clicked. */
  @Output() save = new EventEmitter<DatasetMembershipSaveEvent>();

  /** Org dataset values as comma-separated text. */
  readonly _orgInput = signal("");

  /** Team dataset values as comma-separated text. */
  readonly _teamInput = signal("");

  /** Project dataset values as comma-separated text. */
  readonly _projectInput = signal("");

  /** Personal dataset values as comma-separated text. */
  readonly _personalInput = signal("");

  /** Sync reactive input fields whenever parent membership input changes. */
  ngOnChanges(changes: SimpleChanges): void
  {
    if (!("membership" in changes))
    {
      return;
    }

    this._orgInput.set(this.membership.org.join(", "));
    this._teamInput.set(this.membership.team.join(", "));
    this._projectInput.set(this.membership.project.join(", "));
    this._personalInput.set(this.membership.personal.join(", "));
  }

  /** Emit normalized dataset memberships to the parent container. */
  _save(): void
  {
    this.save.emit({
      membership: {
        org: _ParseCsvMembership(this._orgInput()),
        team: _ParseCsvMembership(this._teamInput()),
        project: _ParseCsvMembership(this._projectInput()),
        personal: _ParseCsvMembership(this._personalInput()),
      },
    });
  }
}

/**
 * Parse comma-separated dataset IDs into normalized values.
 * @param rawValue - Raw comma-separated input.
 */
function _ParseCsvMembership(rawValue: string): string[]
{
  const values = rawValue.split(",").map(function _trim(value)
  {
    return value.trim();
  }).filter(function _isNonEmpty(value)
  {
    return value.length > 0;
  });

  return Array.from(new Set(values));
}
