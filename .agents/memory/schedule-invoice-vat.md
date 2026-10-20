---
name: Automatic schedule invoice VAT
description: VAT behavior for tuition invoices generated from the class scheduling dialog.
---

Class scheduling, enrollment, free-class scheduling, and extensions select one VAT rate per student row. Apply it to the tuition amount after promotion plus surcharge: `max(0, base - promotion + surcharge)`. Keep the default at 0% so existing automatic invoices retain their totals. Store the rate and VAT amount on the invoice item; when the legacy surcharge adjustment is split into its own line during editing, its VAT is the residual at the same rate.

**Why:** The user specified one shared rate for the student's tuition, discount, and surcharge, with no changes to existing promotion or surcharge calculations.

**How to apply:** Keep each dialog limited to its configured promotion/surcharge choices. Use the shared invoice VAT rates and calculation helper in each matching auto-invoice path, and preserve line-level VAT through invoice loading/editing.
