---
name: Invoice print amount variables
description: Product semantics for amount variables in invoice print templates.
---

`{{total}}` means the invoice's final total after promotions, surcharges, and deposit/deduction. `{{thanh_tien}}` means the amount after promotions and surcharges but before the parent invoice's deposit/deduction. When printing one installment, `{{thanh_tien}}` uses that installment's own amount.

For a multi-installment invoice, each child installment is the payment record and source of truth for its own amount, status, due date, and collection details. The parent only links the child installments and summarizes their totals.

Child-installment templates should expose `{{so_tien_dot_con}}`, `{{khuyen_mai_dot_con}}`, and `{{phu_thu_dot_con}}` from that installment's own saved amount fields. Following the invoice breakdown, `so_tien_dot_con` is the pre-KM/PT base amount; the existing child total remains the payable amount after adjustments. A child installment has no separate deposit/deduction amount.

**Why:** The user confirmed this distinction matches the amount labels on the invoice and avoids making the intermediate amount look like the final amount due.

**Why:** The user clarified that child installments are the actual payment records; the parent is only a link and aggregate.

**Why:** The user requested explicit child-only amount, promotion, and surcharge variables so they are not confused with full-invoice values.

**Why:** The user clarified that child installments do not have a separate deduction; their main amount fields are total, promotion, and surcharge.

**How to apply:** Keep `total` and `thanh_tien` distinct in both template-variable descriptions and print rendering. Child-specific print variables must use that installment's values; parent variables must summarize the children and must not substitute for child data.
