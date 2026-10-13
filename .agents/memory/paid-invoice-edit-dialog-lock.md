---
name: Paid invoice edit dialog lock
description: The UI and API behavior for editing paid or confirmed invoices
---

Paid and confirmed invoices cannot have their content edited until they are separately transitioned to unpaid. If a user opens the edit dialog anyway, keep it open, show the warning inside the dialog, block field interaction, and disable saving; do not close it or show only a toast.

**Why:** Finance users need a clear explanation in context without losing the invoice view, while preserving the rule that collected values cannot be edited directly.

**How to apply:** Keep the status-transition control available outside the locked edit form. Enforce the lock at the API as well as in the UI. For invoices with installments, status changes are made on the child installments.
