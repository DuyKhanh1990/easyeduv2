---
name: Score-sheet template configuration
description: Durable rules for conversion-linked and manually authored score-sheet templates.
---

Manual score-sheet templates use named skills with stable IDs and no conversion-section link. Removing a conversion link preserves the current skills, parts, and formulas for manual editing. Switching to another conversion source regenerates the skill list and carries part configuration only for sections that match by section ID or normalized name.

The score-sheet template owns its overall scoring rule separately from the conversion template. When an older linked template has no saved overall rule, opening it should initialize from the linked conversion rule; once saved, the score-sheet rule is its own editable copy. Selecting a different conversion source initializes from that source's rule.

Actual score-entry calculation from these configuration rules is a later phase; do not silently add it to the configuration editor.

Reusable assessment definitions keep a snapshot of the selected score-sheet template, not just its ID, so later edits to the template do not silently change existing configuration. They have no exam date: when assigned to a class session, the actual exam date is that session's `sessionDate`, and the assignment stores the reusable definition ID on the session. Do not change the timetable date or lesson order to assign an exam. Template deadlines are day/hour offsets from each assigned session's local date and shift start time; preserve absolute deadlines already stored on older assessments.

The staff view should treat each assigned conversion assessment as another score-sheet item in the existing timeline, grouped and sorted by the assigned session's exam date and rendered with the same row/card layout as legacy entries. Distinguish it with a “Bảng điểm Quy đổi” label, not a separate section. Legacy grade books are keyed by the old `scoreSheetId`; their score counts or publication state cannot safely represent whether a conversion assessment was entered. Until assessment-specific result persistence exists, show it as not entered rather than inferring from an old grade book.

Deletion eligibility is based on current class-session assignments resolved through their reusable assessment definitions. The schema cannot prove that a template was assigned in the past if that assignment was later cleared; if policy changes to block any historically used template, add durable assignment history rather than inferring it from snapshots or score attempts.

**Why:** A score sheet may be a standalone structure or use an international conversion table, and the overall formula must remain editable without mutating the shared conversion table. The same reusable definition can be assigned on different dates or shifts, so its deadline must be resolved per session instead of storing one absolute date on the reusable definition.

**How to apply:** For deletion or assignment-protection changes, resolve the assigned session's assessment ID to its snapshot/template IDs; do not treat a stale unassigned assessment definition as an active class-session assignment.

**How to apply:** Keep API validation, edit-form state, and conversion switching consistent with these rules. Preserve old linked templates that lack an explicit overall rule and old assessments with fixed deadlines. Resolve new deadlines from the saved template snapshot plus the assigned session date/shift. Include assigned assessments in the staff score-sheet timeline by `sessionDate`, with the existing row style and a conversion label. A future results view should use the saved template snapshot and persist its own entered state rather than borrowing legacy grade-book state. Assignment pickers may display the current score-sheet template name/code alongside the assessment's own label, but scoring and deadlines for an existing assessment must continue to use its saved template snapshot.