---
name: Invoice line VAT
description: VAT behavior in the manual income/expense invoice dialog.
---

Each invoice item can use only 0%, 5%, 8%, or 10% VAT. Calculate tax from the existing line subtotal after item-level promotion and surcharge, display the tax amount beneath the rate selector, and add it to the line total and invoice grand total. Keep other invoice, discount, payment schedule, wallet, and reporting logic unchanged; their amount inputs naturally use the VAT-inclusive grand total. Existing item rows default to 0% and must not be retroactively taxed.

**Why:** The user explicitly chose per-line rate selection and requested that VAT change only the resulting amounts, not downstream business rules.

**How to apply:** Preserve the VAT rate and calculated amount when reopening/editing an invoice. Recalculate tax on the server from the stored pre-VAT subtotal and allowed rate; never trust a client-supplied VAT amount.
