---
name: Tuition surcharge treatment
description: Center-specific distinctions between invoice surcharges, tuition, and tuition-wallet balances.
---

Some centers do not treat invoice surcharges as tuition and do not want them included in tuition-wallet balances. This policy varies by center; do not assume one global treatment.

When a class-transfer tuition item has a surcharge but no session allocations because its package ID differs from the class's package ID, a same-course match may prorate that surcharge for the one-time transfer calculation only. Do not create persistent allocations or change invoice or wallet records.

**Why:** Centers can use the same invoice workflow while following different rules for whether a surcharge represents tuition. Exact package-ID allocation can also leave a same-course invoice item without session rows, hiding its surcharge from class transfer.

**How to apply:** Keep surcharge amounts distinct from package tuition; use a same-course fallback only for one-time class-transfer exclusion when exact package-ID allocation is absent. Confirm the center-specific rule before changing tuition-wallet or persistent transfer accounting.
