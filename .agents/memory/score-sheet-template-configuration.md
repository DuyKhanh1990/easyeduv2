---
name: Score-sheet template configuration
description: Durable rules for conversion-linked and manually authored score-sheet templates.
---

Manual score-sheet templates use named skills with stable IDs and no conversion-section link. Removing a conversion link preserves the current skills, parts, and formulas for manual editing. Switching to another conversion source regenerates the skill list and carries part configuration only for sections that match by section ID or normalized name.

The score-sheet template owns its overall scoring rule separately from the conversion template. When an older linked template has no saved overall rule, opening it should initialize from the linked conversion rule; once saved, the score-sheet rule is its own editable copy. Selecting a different conversion source initializes from that source's rule.

Actual score-entry calculation from these configuration rules is a later phase; do not silently add it to the configuration editor.

Reusable assessment definitions keep a snapshot of the selected score-sheet template for score calculation. They also retain its ID so assigned sessions can read the current linked template's relative deadline and evaluation criteria. They have no exam date: when assigned to a class session, the actual exam date is that session's `sessionDate`, and the assignment stores the reusable definition ID on the session. Do not change the timetable date or lesson order to assign an exam. Resolve current relative deadlines from the assigned session's local date and shift start time; use a legacy absolute deadline only when the linked template is unavailable.

The staff view should treat each assigned conversion assessment as another score-sheet item in the existing timeline, grouped and sorted by the assigned session's exam date and rendered with the same row/card layout as legacy entries. Distinguish it with a “Bảng điểm Quy đổi” label, not a separate section. Legacy grade books are keyed by the old `scoreSheetId`; their score counts or publication state cannot safely represent whether a conversion assessment was entered. Until assessment-specific result persistence exists, show it as not entered rather than inferring from an old grade book.

Deletion eligibility is based on current class-session assignments resolved through their reusable assessment definitions. The schema cannot prove that a template was assigned in the past if that assignment was later cleared; if policy changes to block any historically used template, add durable assignment history rather than inferring it from snapshots or score attempts.

**Why:** A score sheet may be a standalone structure or use an international conversion table, and the overall formula must remain editable without mutating the shared conversion table. The same reusable definition can be assigned on different dates or shifts, so its deadline must be resolved per session instead of storing one absolute date on the reusable definition.

**How to apply:** For deletion or assignment-protection changes, resolve the assigned session's assessment ID to its snapshot/template IDs; do not treat a stale unassigned assessment definition as an active class-session assignment.

**Why:** Editing the linked template's deadline or criteria must affect its assigned assessment; using the old snapshot for those fields left the wrong due date and hid configured evaluation inputs. Score formulas still need the saved snapshot so template edits do not silently recalculate existing scores.

**How to apply:** Keep API validation, edit-form state, and conversion switching consistent with these rules. Preserve old linked templates that lack an explicit overall rule. Use the current linked template for relative deadlines and evaluation criteria, but use the saved template snapshot for score calculation. Include assigned assessments in the staff score-sheet timeline by `sessionDate`, with the existing row style and a conversion label. Persist per-student criterion responses with that attempt, separately from calculated score fields. Assignment pickers may display current template code/name alongside the assessment's own label.

Manual class-session assignment keeps ordinary legacy score sheets in their own list. Its conversion-side picker uses every score-sheet template in the `/score-conversion` “Bảng điểm mẫu” tab, whether or not it links a conversion configuration.

**Why:** The user explicitly wants the whole sample-template list as the source; filtering to templates with a conversion link omits valid choices.

**How to apply:** Continue using `/api/score-sheets` for ordinary sheets and all score-sheet templates for the conversion-side picker. Apply a selected template through the existing template-to-assessment path; do not change the scoring logic.

When reopening a class-session score-sheet assignment from its pencil control, preselect the assigned assessment's source `scoreSheetTemplateId` in the picker rather than the generated assessment ID.

**Why:** The picker is populated from score-sheet templates, while a class session stores the generated assessment ID; using the latter displays a value that does not correspond to a selectable template.

**How to apply:** Resolve the current assessment to its template for the picker selection, while retaining the existing assessment as the session assignment. Saving the same template should use the existing reuse path and must not create a duplicate assessment or alter scoring.