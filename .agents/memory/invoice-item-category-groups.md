---
name: Invoice item category groups
description: Presentation-only grouping of invoice item rows by transaction category in the create/edit dialog.
---

Show each distinct category as one header row and place its product rows beneath it. A plus on a category header adds a row to that category; adding from the main button selects a category and joins its existing group rather than creating a duplicate header. Keep each product's category ID on its item, and do not reorder the underlying item array merely to render groups. Existing invoices should group from their saved item categories without any data migration or automatic rewrite.

**Why:** The user explicitly scoped this to a UI change and asked that invoice behavior and existing records remain unchanged.

**How to apply:** Derive groups for display only. Preserve existing item IDs, category values, and array order in save payloads; category selection on a group header changes the category for every item in that group.
