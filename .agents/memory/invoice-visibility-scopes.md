---
name: Invoice visibility scopes
description: The six invoice scopes are additive visibility filters, separate from existing action permissions.
---

Keep the existing invoice `canView`, `canViewAll`, `canCreate`, `canEdit`, and `canDelete` permissions unchanged. The six Thu/Chi status scopes only determine which invoice rows are visible; they do not grant or revoke create, edit, delete, or status-change rights. Statuses outside those six scopes (such as canceled/history) keep their existing visibility behavior. Do not scope financial summaries or alter invoice write behavior.

**Why:** The user clarified that the original permission flags already worked and asked for six additional visibility permissions without changing financial behavior.

**How to apply:** When extending invoice permissions, preserve existing action flags and write routes. Apply the added scopes only to the six covered invoice-list categories (and their status tabs/filter options). Preserve visibility for uncategorized historical statuses. Treat legacy null scope values as unrestricted to preserve current access.