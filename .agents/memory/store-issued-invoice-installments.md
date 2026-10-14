---
name: Store-issued invoice installments
description: When auto-generated store issue invoices should create payment schedule rows
---

An automatically generated invoice for a completed warehouse issue receipt must not create a payment-schedule installment when nothing has been paid. Create a paid first installment and an unpaid remainder installment only when the receipt has received a partial payment; fully paid invoices do not need an unpaid schedule.

**Why:** A fully unpaid invoice is already represented by its invoice status and balance. An automatic “Đợt 1” row looks like an extra installment and can confuse finance staff.

**How to apply:** Keep `paidAmount` and `remainingAmount` on the invoice itself when `paidAmount` is zero. Only create schedule rows for a partial-payment split, and do not retroactively rewrite existing invoices without authorization.
