---
name: Standard invoice and bulk QR semantics
description: Payer-identifying transfer content and safe standard QR behavior for individual and bulk invoice collection.
---

For manual/standard bank-transfer QR codes on invoices, including `/my-space/invoices`, place the customer or student name first, followed by the student code when available, then the invoice description or note. If both are empty, use a short transfer-purpose phrase followed by the invoice code. Allow only ASCII letters, numbers, and spaces; replace punctuation such as hyphens and underscores with spaces. Remove Vietnamese diacritics from the name/code but preserve their stored uppercase and lowercase exactly. Keep automatic BIDV Virtual Account content separate.

For bulk income collection, show one standard QR in the total summary card when the payment method is bank transfer. Encode only the outstanding selected total and short receipt references; include a customer identity first when the selected receipts belong to one customer, otherwise use a bulk-collection label. A single QR must target one center's receiving account. Showing or scanning the QR must not mark invoices paid; staff confirms receipt before consolidating. Expense consolidation does not use an incoming-payment QR.

**Why:** Manual transfers need payer identity for reconciliation; bulk QR must match the exact unpaid amount and correct receiving account, while QR display alone is not proof of payment.

**How to apply:** When changing standard QR content, add identity before invoice details. For bulk collection, keep QR generation separate from the paid-status mutation and reject mixed-center batches. Strip accents from identity without changing its case; sanitize transfer text to letters, numbers, and spaces. Do not change automatic BIDV QR behavior unless requested.
