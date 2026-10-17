---
name: ZBS transfer template payload
description: Approved transfer-template field mapping for installment invoices.
---

For an installment-specific ZBS payment request, use the installment code and installment amount when present. Set Zalo's reserved `transfer_amount` from that payable amount as a raw number; keep the existing EasyEdu `remaining_amount` token and provide its numeric value separately. If there is no installment, use the parent invoice code and remaining balance. For category `Kho`, when the invoice note is blank, populate `invoice_note` from invoice description; otherwise preserve the note.

**Why:** The user approved this mapping after comparing a tuition invoice installment and a warehouse invoice installment; the ZBS template has its own transfer amount parameter, while EasyEdu tokens remain unchanged.

**How to apply:** Keep this transformation within ZBS payload preparation. Do not alter existing OA notification behavior or send messages during local payload checks.
