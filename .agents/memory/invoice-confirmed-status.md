---
name: Invoice confirmed status
description: Business rules for the invoice status confirmed
---

`confirmed` is a distinct invoice/visible installment status shown as “Đã xác nhận”, but it represents the same single paid business state: paid tab membership, paid amounts, collection reports, debt exclusion, and commission matching. Switching `paid` ↔ `confirmed` is only a label/status change and must not create wallet entries, notifications, settle codes, or a second report event.

**Why:** Finance users need to distinguish an invoice that has been confirmed from one explicitly marked paid without changing the financial meaning or duplicating the payment event. For invoices with installments, the child invoices are the independent records used for display and transactions; the parent exists only to group and summarize them.

**How to apply:** For an invoice with multiple installments, never propagate a parent status change to child invoices and never use the parent to override a child’s status. The child invoices are the primary display and transaction records; the parent only groups and summarizes them. Payment installments may also be set to `confirmed` from the finance list. Treat `paid` and `confirmed` as paid-like for installment totals and restrictions, but keep each child’s status independent: tabs and row counts use child status when schedules exist. Preserve `paidAt`, `paidBy`, amounts, and settle code across `paid` ↔ `confirmed`; status changes must also update invoice `updatedBy`/`updatedAt` and create a visible audit-history entry. Any new invoice workflow that checks paid state must include `confirmed`.