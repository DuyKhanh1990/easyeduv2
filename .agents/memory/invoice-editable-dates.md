---
name: Invoice editable dates
description: Rules for changing invoice creation and payment dates from the finance list.
---

Invoice creation and payment dates are editable from the invoice list. For unpaid or partial invoices, the existing invoice edit permission is sufficient. For paid or confirmed invoices and paid/confirmed payment schedules, editing either date requires both the existing invoice edit permission and the separate `/invoices#edit-paid-dates` permission; the extra permission alone must not grant general invoice editing. Keep the update timestamp system-managed.

**Why:** Finance users need to correct historical invoice dates, but changes to paid/confirmed invoices can affect reporting periods and need a separate, explicit grant. The user asked to add this gate without changing other invoice permissions.

**How to apply:** Gate paid/confirmed date cells in the UI and enforce the same rule in both invoice and schedule PATCH routes. Validate that payment date is not earlier than creation date, write changes to the existing audit history, and do not rerun wallet/payment side effects for date-only edits. For direct bulk entry, an optional per-row payment date is the historical business date: when provided, use it for both createdAt and paidAt for paid amounts; when blank, preserve the existing automatic payment-date behavior. Keep updatedAt as the actual import time.