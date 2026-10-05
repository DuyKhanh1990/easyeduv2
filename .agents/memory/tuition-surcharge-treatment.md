---
name: Tuition surcharge treatment
description: Center-specific distinctions between invoice surcharges, tuition, and tuition-wallet balances.
---

Most centers do not count invoice surcharges as tuition. In class transfer, default to excluding the surcharge, while allowing staff to turn that one-time exclusion off for exceptions. Do not change tuition-wallet balances.

For class transfers, use the class-linked tuition invoice item's subtotal as the source value whenever an applicable invoice exists, even if its package ID differs from the class package but belongs to the same course. The class package price is only a fallback when there is no applicable invoice. An optional surcharge exclusion changes only that transfer calculation.

The actual registered-session count defaults from invoice allocations but remains editable. If changed, divide the invoice total (subtracting the fixed surcharge only when exclusion is enabled) by the manual count; the transfer count changes only the resulting transfer total.

For class transfers, the invoice is the preferred pricing source whenever an applicable tuition invoice exists. Offer a source selector only when its package differs from the class/schedule package; if no applicable invoice exists, use the class/schedule package. Switching sources changes only this transfer calculation and should be recorded in transfer history.

**Why:** The user says most centers do not count surcharge as tuition, so the transfer default should match that common policy. The user also confirmed the invoice is the authoritative source when available, while the class/schedule package is the fallback and an alternative only when the two differ. Exact package-ID allocation can leave a same-course invoice item without session rows, causing class transfer to use the class package price instead of the amount actually invoiced.

**How to apply:** Default the one-time transfer exclusion to on whenever the dialog opens. Display the full invoice surcharge independently of the selected transfer count. Keep the registered-session count editable and use a manual override as the per-session denominator; apply transfer count only to the final total. Prefer invoice pricing, offer the class/schedule source only when its package differs, and use it when no applicable invoice exists. Record the selected source without changing invoice or wallet records. Allocate the class-linked invoice item subtotal across its sessions for preview and accounting; do not create persistent allocations or change invoice or wallet records for this fallback. Confirm the center-specific rule before changing surcharge treatment in tuition-wallet accounting.
