---
name: CRM relationship filter scope
description: Which CRM relationship records may appear in the customer advanced relationship filter.
---

The advanced customer relationship filter shows parent groups as non-selectable headings and only their child relationships as selectable entries. Exclude standalone relationships and system defaults.

**Why:** The user specified that only child relationships should be selectable and clarified that unrelated standalone CRM settings do not belong in this filter.

**How to apply:** Build filter choices from valid parent-child relationships, not from the flat CRM relationship configuration list.
