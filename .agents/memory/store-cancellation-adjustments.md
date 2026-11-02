---
name: Store cancellation vs adjustments
description: Keep cancelled receipt movements distinct from normal imports, exports, and receipt edits in inventory summaries.
---

**Rule:** Inventory totals must reconcile to available physical stock: net inbound = imports + transfer-in + all positive edits − cancelled imports; net outbound = exports + transfer-out + absolute value of all negative edits − cancelled exports. Cancellation remains visible in its own summary card, but it nets against the original direction rather than becoming a new import/export in the opposite direction. Split edit adjustments by import/export source for detail; their signed deltas are already included in net inbound/outbound. Keep the ten detail cards in one compact row.

**Why:** The user wants Nhập tổng − Xuất tổng to equal actual stock and remain nonnegative; a cancelled export reduces net exports, while a cancelled import reduces net imports.

**How to apply:** When changing inventory summary cards or list totals, use the transaction delta sign to group stock increases and decreases, and use edit_import/edit_export only for the source breakdown. Reconcile displayed net totals to the stock ledger. For actual receipt-list movement totals, aggregate only completed receipt rows; keep cancelled quantities positive on the document row as an audit of the original receipt.
