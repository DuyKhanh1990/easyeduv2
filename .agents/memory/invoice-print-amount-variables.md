---
name: Invoice print amount variables
description: Product semantics for amount variables in invoice print templates.
---

For the listed parent-summary tokens, use the parent invoice values when printing an installment and the invoice itself when printing a single invoice: `{{total}}` = parent grand total, `{{tong_truoc_kmpt}}` = parent pre-adjustment total, `{{tong_km}}` / `{{tong_pt}}` = parent promotion/surcharge totals, `{{khau_tru}}` = parent deduction, and `{{da_thanh_toan}}` / `{{con_lai}}` = parent paid/remaining totals. `{{thanh_tien}}` remains a separate token with its existing behavior.

`{{tong_sau_khau_tru}}` is an intentionally clearer alias for the same post-deduction total as `{{total}}`; keep both available.

For a multi-installment invoice, each child installment is the payment record and source of truth for its own amount, status, due date, and collection details. The parent only links the child installments and summarizes their totals.

Child-installment templates should expose `{{so_tien_dot_con}}`, `{{khuyen_mai_dot_con}}`, `{{phu_thu_dot_con}}`, and `{{tong_sau_kmpt_dot_con}}` from that installment's own saved amount fields. Following the invoice breakdown, `so_tien_dot_con` is the pre-KM/PT base amount; `tong_sau_kmpt_dot_con` is the payable amount after adjustments. Keep `{{total}}` for saved-template compatibility, but use the explicit child token for new multi-installment templates. A child installment has no separate deposit/deduction amount.

Customers may use one saved print template for both single invoices and installment receipts. The parent-summary tokens have the same semantics for both: a single invoice is its own parent, while an installment receipt reads the real parent invoice. Child-specific tokens remain available for values belonging to the printed installment.

**Why:** The user confirmed this distinction matches the amount labels on the invoice and avoids making the intermediate amount look like the final amount due.

**Why:** The user clarified that child installments are the actual payment records; the parent is only a link and aggregate.

**Why:** The user requested explicit child-only amount, promotion, and surcharge variables so they are not confused with full-invoice values.

**Why:** The user clarified that child installments do not have a separate deduction; their main amount fields are total, promotion, and surcharge.

**Why:** The user specified that these generic financial tokens should consistently represent parent-level information; for a single invoice, parent and invoice are the same record.

**Why:** The user accepted `{{total}}` and `{{tong_sau_khau_tru}}` sharing one function so templates can use the clearer name without losing compatibility.

**Why:** The user asked to remove duplicate parent-total and `{{thanh_tien}}` choices from the template variable picker while preserving old saved templates.

**Why:** Visibility-scoped invoice-list projections can replace `totalAmount` with an adjusted visible-schedule total, so it is not always safe as the source for `tong_truoc_kmpt`.

**How to apply:** Resolve generic invoice-level amounts and adjustment components from `parentInvoice` with a self-fallback when absent; child-only amount tokens come from the printed schedule. Keep `total` and `tong_sau_khau_tru` as aliases. Hide duplicate parent `_hd_goc` tokens and `thanh_tien` from new-template choices, but retain runtime aliases for saved templates. When scoped `totalAmount` equals adjusted `grandTotal` despite nonzero adjustments, reconstruct the pre-KM/PT base from grand total + promotions - surcharges + deduction.
