---
name: Invoice creation flow parity
description: Shared invoice creation behavior across manual and automatic sources
---

Invoices created manually or automatically from another feature must use the same canonical invoice creation logic. Automatic sources should map their source records into the common invoice payload rather than independently implementing totals, payment schedules, status, code generation, and financial side effects.

**Why:** The user expects an automatic invoice to be the same invoice product as a manually created one, with only its source data filled in. Separate creation logic caused inconsistent unpaid installment behavior.

**How to apply:** Extract a shared invoice creation service and keep source-specific mapping at the boundary. Pass an explicit source/origin so the shared flow does not recursively create duplicate warehouse issue receipts when the invoice originates from Store. Preserve the existing accounting, notification, audit, and inventory effects during the refactor.
