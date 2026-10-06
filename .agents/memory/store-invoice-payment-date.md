---
name: Store-receipt invoice payment dates
description: Business rule for paid warehouse issue receipts whose automatically generated invoice lost its payment date.
---

**Rule:** The user confirms that amounts entered as paid with a warehouse issue receipt are paid on the same day the receipt and its automatically generated invoice are created. If a linked paid warehouse invoice has lost its payment date, invoice creation time is an approved temporary source. This is not a rule for unrelated invoice types.

**Why:** The invoice-generation path could omit the payment date even though the payment was received with the receipt. The user approved using the creation date as the temporary historical value.

**How to apply:** Limit any repair to paid `Kho` invoices linked to an active store issue receipt and missing the relevant payment date. Preserve existing dates and unrelated financial records, and record that the restored date is inferred from invoice creation.
