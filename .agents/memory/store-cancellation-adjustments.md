---
name: Store cancellation vs adjustments
description: Keep cancelled receipt movements distinct from normal imports, exports, and receipt edits in inventory summaries.
---

**Rule:** Inventory detail totals are grouped by stock impact, not source document: inbound = imports + transfer-in + cancelled exports + all positive edits; outbound = exports + transfer-out + cancelled imports + all negative edits. Split edit adjustments by import/export source for detail, but component cards are already included in these totals. In the outside inventory list, net import = imports + transfer-in + positive edits − cancelled imports; net export = exports + transfer-out + negative edits − cancelled exports. Their difference must reconcile to actual stock. Keep the ten detail cards in one compact row.

**Why:** The user wants totals that reflect actual stock increases/decreases, with cancellations and edits from either receipt type classified by their signed stock effect rather than mistaken for new imports or exports.

**How to apply:** When changing inventory summary cards or list totals, use the transaction delta sign to group stock increases and decreases, and use edit_import/edit_export only for the source breakdown. Reconcile displayed net totals to the stock ledger. For actual receipt-list movement totals, aggregate only completed receipt rows; keep cancelled quantities positive on the document row as an audit of the original receipt.
