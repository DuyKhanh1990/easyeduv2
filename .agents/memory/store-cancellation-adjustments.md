---
name: Store cancellation vs adjustments
description: Keep cancelled receipt movements distinct from normal imports, exports, and receipt edits in inventory summaries.
---

**Rule:** Inventory summary cards distinguish cancelled exports (stock returned) and cancelled imports (stock removed) from normal import/export and edit adjustments. Show cancellation types as their own metrics so returned stock is not labeled as newly imported. Keep the ten summary cards in one compact row.

**Why:** The user wants a cancelled export to be visible as a reversal, not mistaken for a new purchase or a net increase, while retaining the single-row summary layout.

**How to apply:** When changing inventory summary cards or list totals, separate transaction types in display aggregation and ensure each quantity delta appears in exactly one category. Reconcile all displayed movements to actual stock.
