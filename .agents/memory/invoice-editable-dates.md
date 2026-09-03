---
name: Invoice editable dates
description: Rules for changing invoice creation and payment dates from the finance list.
---

Invoice creation and payment dates are editable from the invoice list, while the update timestamp remains system-managed. Payment date must never be earlier than creation date; enforce this on both client and server, and include changes in the existing invoice audit history.

**Why:** Finance users need to correct historical invoice dates, but allowing an impossible payment sequence would corrupt reporting and audit interpretation.

**How to apply:** Keep date edits as a small inline save/cancel interaction, validate the effective pair of dates server-side, and use the existing “Sửa hoá đơn” audit event with localized field labels. For direct bulk entry, an optional per-row payment date is the historical business date: when provided, use it for both createdAt and paidAt for paid amounts; when blank, preserve the existing automatic payment-date behavior. Keep updatedAt as the actual import time.