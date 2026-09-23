---
name: Invoice installment adjustments
description: Rules for promotions and surcharges assigned to unpaid invoice installments.
---

An installment's final amount is `max(0, base amount - installment promotions + installment surcharges)`. Legacy rows without adjustment data treat their current amount as the base and remain unchanged until explicitly edited.

**Why:** Each child installment is the financial record used by cash-flow, debt, and payment reporting; recalculating from the final amount or leaving the hidden parent total unchanged would compound adjustments or make summaries disagree.

**How to apply:** Only unpaid installments may change adjustment data. Recalculate on the server from configured promotion/surcharge records, keep paid/confirmed installments immutable, and synchronize the hidden parent invoice's grand total, paid amount, remaining amount, and status when child totals change.