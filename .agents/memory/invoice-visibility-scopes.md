---
name: Invoice visibility scopes
description: The six invoice scopes are additive visibility filters, separate from existing action permissions.
---

Keep the existing invoice `canView`, `canViewAll`, `canCreate`, `canEdit`, and `canDelete` permissions unchanged. The six Thu/Chi status scopes only determine which invoice rows are visible; they do not grant or revoke create, edit, delete, or status-change rights. Do not scope financial summaries or alter invoice write behavior.

**Why:** The user clarified that the original permission flags already worked and asked for six additional visibility permissions without changing financial behavior.

**How to apply:** When extending invoice permissions, preserve existing action flags and write routes. Apply the added scopes only to invoice-list visibility (and its status tabs/filter options). Treat legacy null scope values as unrestricted to preserve current access.