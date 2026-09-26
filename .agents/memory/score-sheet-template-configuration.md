---
name: Score-sheet template configuration
description: Durable rules for conversion-linked and manually authored score-sheet templates.
---

Manual score-sheet templates use named skills with stable IDs and no conversion-section link. Removing a conversion link preserves the current skills, parts, and formulas for manual editing. Switching to another conversion source regenerates the skill list and carries part configuration only for sections that match by section ID or normalized name.

The score-sheet template owns its overall scoring rule separately from the conversion template. When an older linked template has no saved overall rule, opening it should initialize from the linked conversion rule; once saved, the score-sheet rule is its own editable copy. Selecting a different conversion source initializes from that source's rule.

Actual score-entry calculation from these configuration rules is a later phase; do not silently add it to the configuration editor.

**Why:** A score sheet may be a standalone structure or use an international conversion table, and the overall formula must remain editable without mutating the shared conversion table.

**How to apply:** Keep API validation, edit-form state, and conversion switching consistent with these rules. Preserve old linked templates that lack an explicit overall rule.