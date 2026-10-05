---
name: Tuition surcharge treatment
description: Center-specific distinctions between invoice surcharges, tuition, and tuition-wallet balances.
---

Some centers do not treat invoice surcharges as tuition and do not want them included in tuition-wallet balances. This policy varies by center; do not assume one global treatment.

For class transfers, use the class-linked tuition invoice item's subtotal as the source value whenever an applicable invoice exists, even if its package ID differs from the class package but belongs to the same course. The class package price is only a fallback when there is no applicable invoice. An optional surcharge exclusion changes only that transfer calculation.

**Why:** Centers can use the same invoice workflow while following different rules for whether a surcharge represents tuition. Exact package-ID allocation can leave a same-course invoice item without session rows, causing class transfer to use the class package price instead of the amount actually invoiced.

**How to apply:** Allocate the class-linked invoice item subtotal across its sessions for class-transfer preview and accounting; subtract its item surcharge only when the one-time exclusion is enabled. Do not create persistent allocations or change invoice or wallet records for this fallback. Confirm the center-specific rule before changing surcharge treatment in tuition-wallet accounting.
