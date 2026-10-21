---
name: Invoice print-preview parity
description: Keep on-screen invoice previews and browser-printed invoices visually consistent.
---

The invoice preview and the real printed document should share the same page inset and base text/table styles. Borderless layout tables should align their outermost text with ordinary text rather than adding default cell-edge padding.

**Why:** the user reported that a receipt fit in the on-screen preview but split across two printed pages, and that text in borderless tables appeared indented compared with ordinary lines.

**How to apply:** keep print-frame CSS and preview CSS sourced from the same base styles. Reset browser-default paragraph spacing and table border spacing without overriding intentional inline formatting.
