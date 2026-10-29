---
name: Store cancellation vs adjustments
description: Keep cancelled receipt movements distinct from normal imports, exports, and receipt edits in inventory summaries.
---

**Rule:** Inventory detail cards distinguish cancelled exports (stock returned) and cancelled imports (stock removed) from normal import/export and edit adjustments. In the outside inventory list, net import = imports + transfer-in + positive edits − cancelled imports; net export = exports + transfer-out + negative edits − cancelled exports. Their difference must reconcile to actual stock. Keep the ten detail cards in one compact row.

**Why:** The user wants a cancelled export to be visible as a reversal, not mistaken for a new purchase or a net increase, while retaining the single-row summary layout.

**How to apply:** When changing inventory summary cards or list totals, use the cancellation transaction type to offset the original direction rather than count it as a new import/export. Reconcile displayed net totals to the stock ledger.
