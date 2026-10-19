---
name: Invoice line VAT
description: VAT behavior in the manual income/expense invoice dialog.
---

Each invoice item can use only 0%, 5%, 8%, or 10% VAT. Calculate tax from the existing line subtotal after item-level promotion and surcharge, display the tax amount beneath the rate selector, and add it to the line total and invoice grand total. Keep other invoice, discount, payment schedule, wallet, and reporting logic unchanged; their amount inputs naturally use the VAT-inclusive grand total. Existing item rows default to 0% and must not be retroactively taxed.

The invoice sidebar shows an aggregate “Tổng VAT” row directly below surcharge so users can reconcile the VAT included in the total.

For Mắt Bão signing, pass VAT only for per-session (`buổi`) items for now; leave course-package (`khoá`) items unchanged until their quantity and taxable-base semantics are resolved.

**Why:** The user chose to preserve the working product, promotion, and surcharge mapping while adding VAT to per-session items first, and deferred course-package quantity behavior.

**How to apply:** Preserve the VAT rate and calculated amount when reopening/editing an invoice. Recalculate tax on the server from the stored pre-VAT subtotal and allowed rate; never trust a client-supplied VAT amount. Do not broaden Mắt Bão signing VAT to `khoá` until its invoice amount matches the app's package semantics.
