---
name: Score-sheet template configuration
description: Durable rules for conversion-linked and manually authored score-sheet templates.
---

Manual score-sheet templates use named skills with stable IDs and no conversion-section link. Removing a conversion link preserves the current skills, parts, and formulas for manual editing. Switching to another conversion source regenerates the skill list and carries part configuration only for sections that match by section ID or normalized name.

The score-sheet template owns its overall scoring rule separately from the conversion template. When an older linked template has no saved overall rule, opening it should initialize from the linked conversion rule; once saved, the score-sheet rule is its own editable copy. Selecting a different conversion source initializes from that source's rule.

Actual score-entry calculation from these configuration rules is a later phase; do not silently add it to the configuration editor.

Reusable assessment definitions keep a snapshot of the selected score-sheet template, not just its ID, so later edits to the template do not silently change existing configuration. They have no exam date: when assigned to a class session, the actual exam date is that session's `sessionDate`, and the assignment stores the reusable definition ID on the session. Do not change the timetable date or lesson order to assign an exam. Any configured score deadline remains a local wall-clock date-time.

**Why:** A score sheet may be a standalone structure or use an international conversion table, and the overall formula must remain editable without mutating the shared conversion table. The same reusable definition can be assigned on different dates, so the actual exam date belongs to each scheduled session.

**How to apply:** Keep API validation, edit-form state, and conversion switching consistent with these rules. Preserve old linked templates that lack an explicit overall rule. A future results view should derive exam date from the assigned session's `sessionDate` and use the saved template snapshot.