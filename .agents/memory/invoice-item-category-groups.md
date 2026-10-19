---
name: Invoice item category groups
description: Presentation-only grouping of invoice item rows by transaction category in the create/edit dialog.
---

Show each distinct category as one header row and place its product rows beneath it. The green plus next to a category lets the user choose another category; if it already exists, reuse that group, otherwise create a group with a blank item. The product plus adds a row to that category. Keep each product's category ID on its item, and do not reorder the underlying item array merely to render groups. Existing invoices should group from their saved item categories without any data migration or automatic rewrite.

Use underline-style controls in product rows rather than rounded input boxes.
For course packages, keep the explanatory note inside the same product row, directly beneath the package name; do not render it as a separate table row. Align monetary values consistently to the right within their columns.

**Why:** The user explicitly scoped this to a UI change and asked that invoice behavior and existing records remain unchanged.

**How to apply:** Derive groups for display only. Preserve existing item IDs, category values, and array order in save payloads; category selection on a group header changes the category for every item in that group.
