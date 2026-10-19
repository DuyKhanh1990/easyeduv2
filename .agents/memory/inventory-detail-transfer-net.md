---
name: Inventory detail transfer net
description: How the transfer summary card should represent stock movements for one warehouse.
---

For a product's per-warehouse inventory detail, the main Chuyển kho value is the signed net impact: transfer-in plus transfer-out. Show the in and out subtotals separately as signed values. Do not display gross transfer volume as the main number.

**Why:** The user expects a transfer out of one unit from the source warehouse to appear as −1, because the card explains that warehouse's stock change.

**How to apply:** When displaying one warehouse, calculate transfer net from signed ledger deltas. Transfers remain internal to the organization, so across all warehouses their net should be zero when both sides are included.
