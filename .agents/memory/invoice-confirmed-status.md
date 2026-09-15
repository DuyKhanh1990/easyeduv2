---
name: Invoice confirmed status
description: Business rules for the invoice status confirmed
---

`confirmed` is a distinct invoice status shown as “Đã xác nhận”, but it is paid-equivalent for all business behavior: paid tab membership, paid amounts, wallet entries, settle codes, notifications, collection reports, debt exclusion, and commission matching.

**Why:** Finance users need to distinguish an invoice that has been confirmed from one explicitly marked paid without changing the financial meaning of the status.

**How to apply:** Keep payment installment statuses as `unpaid`/`paid`; apply the paid-equivalent check only to the parent invoice status. Any new invoice workflow that checks paid state must include `confirmed`.