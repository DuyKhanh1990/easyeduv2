---
name: Invoice print amount variables
description: Product semantics for amount variables in invoice print templates.
---

`{{total}}` means the invoice's final total after promotions, surcharges, and deposit/deduction. `{{thanh_tien}}` means the amount after promotions and surcharges but before the parent invoice's deposit/deduction. When printing one installment, `{{thanh_tien}}` uses that installment's own amount.

**Why:** The user confirmed this distinction matches the amount labels on the invoice and avoids making the intermediate amount look like the final amount due.

**How to apply:** Keep `total` and `thanh_tien` distinct in both template-variable descriptions and print rendering. Parent invoice adjustments must not redefine the meaning of an installment's own amount.
