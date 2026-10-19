---
name: Paid invoice edit dialog lock
description: The UI and API behavior for editing paid or confirmed invoices
---

Paid and confirmed invoices cannot have their content edited until they are separately transitioned to unpaid, except that the note may be changed. The invoice creation/payment dates are a separate exception: they may be edited only when the user has both invoice edit permission and the dedicated paid-date permission. In the edit dialog, keep the note editable and all other content locked. Keep the dialog close controls outside the lock overlay so users can always close it.

**Why:** Finance users need a clear explanation in context while preserving the rule that collected values cannot be edited directly; notes remain useful for recording non-financial context after payment.

**How to apply:** Keep status-only changes available and enforce the content lock at the API as well as in the UI. Allow paid-invoice note-only PATCH requests; reject any patch that combines note changes with other fields. For invoices with installments, status changes are made on the child installments.
