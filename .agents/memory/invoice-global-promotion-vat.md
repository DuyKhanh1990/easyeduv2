---
name: Invoice-wide promotion VAT
description: User-provided VAT treatment for invoice-wide commercial discounts and e-invoice lines.
---

For invoice-wide discounts, the user requires a discount e-invoice line with `TChat=3` and the corresponding `TSuat` when all discounted products share one VAT rate. If the invoice contains multiple VAT rates, split/allocate the discount across the applicable VAT-rate groups (or corresponding product lines); do not apply one arbitrary VAT rate to the combined discount. The discount must reduce the taxable base for each rate group.

Keep the UI's invoice-wide promotion as a single logical promotion when useful, but calculate and emit separate tax allocations per VAT group. Preserve the promotion's manually entered name on the resulting discount line(s). The exact allocation and rounding must keep the split amounts equal to the total discount.

**Why:** The user clarified that invoice-wide discounts apply to the combined products without requiring manual per-product promotion entry, while e-invoice VAT treatment still must match the products' tax rates.

**How to apply:** When implementing global promotion calculations or e-invoice export, apply after product-level promotions and before VAT; allocate to each applicable VAT-rate group and recalculate its VAT. Do not treat the global discount as VAT-exempt or assign a single rate when rates differ.
