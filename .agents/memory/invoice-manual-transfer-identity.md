---
name: Manual invoice QR identity
description: Ordering of standard bank-transfer QR content to identify the payer.
---

For manual/standard bank-transfer QR codes on invoices, place the customer or student name first, followed by the student code when available, then preserve the existing invoice description, note, or fallback code. Remove Vietnamese diacritics from the name/code but preserve their stored uppercase and lowercase exactly. Keep automatic BIDV Virtual Account content separate.

**Why:** Manual transfers need the payer's identity in the bank statement so staff can match incoming payments to the correct customer.

**How to apply:** When changing the standard QR content, add identity before existing invoice details. Strip accents from identity without changing its case; retain existing lower-case bank sanitization for the description. Do not change automatic BIDV QR behavior unless requested.
