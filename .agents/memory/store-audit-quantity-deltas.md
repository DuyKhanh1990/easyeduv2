---
name: Store audit quantity deltas
description: Display-only quantity change values in warehouse receipt edit history.
---

**Rule:** In edit history for warehouse receipts and issue receipts, display a “Tăng/Giảm” value derived from the saved before/after audit values. Keep it strictly presentation-only; do not modify stock, ledger, invoice, or receipt workflows.

**Why:** The user asked to make receipt edits easier to review while explicitly requiring that current operational behavior remain untouched.

**How to apply:** Show positive values for increases and negative values for decreases, including added/removed products and aggregate total quantity. Use a dash for fields that do not represent quantities.
