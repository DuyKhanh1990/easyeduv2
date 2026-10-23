---
name: Invoice print-preview parity
description: Keep on-screen invoice previews and browser-printed invoices visually consistent.
---

The invoice preview and the real printed document should share the same page inset and base text/table styles. Borderless layout tables should align their outermost text with ordinary text rather than adding default cell-edge padding, and the shared styles must hide their cell borders/backgrounds in the isolated print iframe as well.

**Why:** the user reported that a receipt fit in the on-screen preview but split across two printed pages, that text in borderless tables appeared indented, and that browser printing restored cell borders hidden by the app's global stylesheet.

**How to apply:** keep print-frame CSS and preview CSS sourced from the same base styles. Reset browser-default paragraph spacing and table border spacing without overriding intentional inline formatting; include the `data-borderless="true"` border and background resets in the shared styles because the print iframe does not load the app's global CSS.
