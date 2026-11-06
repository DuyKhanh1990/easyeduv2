---
name: Manual invoice QR identity
description: Ordering of standard bank-transfer QR content to identify the payer.
---

For manual/standard bank-transfer QR codes on invoices, including `/my-space/invoices`, place the customer or student name first, followed by the student code when available, then the invoice description or note. If both are empty, use a short transfer-purpose phrase followed by the invoice code. Allow only ASCII letters, numbers, and spaces; replace punctuation such as hyphens and underscores with spaces. Remove Vietnamese diacritics from the name/code but preserve their stored uppercase and lowercase exactly. Keep automatic BIDV Virtual Account content separate.

**Why:** Manual transfers need the payer's identity in the bank statement so staff can match incoming payments to the correct customer.

**How to apply:** When changing standard QR content, add identity before invoice details. Strip accents from identity without changing its case; sanitize transfer text to letters, numbers, and spaces. Do not change automatic BIDV QR behavior unless requested.
