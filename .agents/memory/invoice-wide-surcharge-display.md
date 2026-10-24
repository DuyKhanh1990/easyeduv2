---
name: Invoice-wide surcharge display
description: How to show whole-invoice surcharges alongside product-level surcharges without changing saved totals.
---

Invoice-wide surcharges should appear as a separate display row beneath the product rows, consistent with product-level surcharges. The row is a visual representation of `invoiceSurchargeAmount`, not an invoice item.

**Why:** The user confirmed the earlier invoice editor displayed both kinds of surcharge as rows; historical invoices may store the whole-invoice surcharge only in aggregate fields, while product-level surcharge rows live with invoice items.

**How to apply:** Keep the display-only row out of the submitted invoice `items` and do not add it to product subtotals. Preserve the existing invoice-level amount and VAT treatment so rendering the row cannot double-count a charge.
