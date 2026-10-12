---
name: Invoice print amount variables
description: Product semantics for amount variables in invoice print templates.
---

`{{total}}` means the invoice's final total after promotions, surcharges, and deposit/deduction. `{{thanh_tien}}` means the amount after promotions and surcharges but before the parent invoice's deposit/deduction. When printing one installment, `{{thanh_tien}}` uses that installment's own amount.

For a multi-installment invoice, each child installment is the payment record and source of truth for its own amount, status, due date, and collection details. The parent only links the child installments and summarizes their totals.

Child-installment templates should expose `{{so_tien_dot_con}}`, `{{khuyen_mai_dot_con}}`, `{{phu_thu_dot_con}}`, and `{{tong_sau_kmpt_dot_con}}` from that installment's own saved amount fields. Following the invoice breakdown, `so_tien_dot_con` is the pre-KM/PT base amount; `tong_sau_kmpt_dot_con` is the payable amount after adjustments. Keep `{{total}}` for saved-template compatibility, but use the explicit child token for new multi-installment templates. A child installment has no separate deposit/deduction amount.

Customers may use one saved print template for both single invoices and installment receipts. Legacy tokens must keep their existing meaning and remain usable across both print types; child-specific tokens are optional additions and must not replace `{{total}}` in a shared template. Distinguish a real payment-schedule child from a synthetic one-row view of a single invoice before filling child-only values.

**Why:** The user confirmed this distinction matches the amount labels on the invoice and avoids making the intermediate amount look like the final amount due.

**Why:** The user clarified that child installments are the actual payment records; the parent is only a link and aggregate.

**Why:** The user requested explicit child-only amount, promotion, and surcharge variables so they are not confused with full-invoice values.

**Why:** The user clarified that child installments do not have a separate deduction; their main amount fields are total, promotion, and surcharge.

**Why:** The user said customers may share one print template across invoice types and does not want existing variable behavior changed.

**How to apply:** Keep `total` and `thanh_tien` distinct in both template-variable descriptions and print rendering. Child-specific print variables must use that installment's values; parent variables must summarize the children and must not substitute for child data.
