---
name: Finance translation parity
description: Rules for auditing the invoice page translation consistently across its child dialogs and generated previews.
---

The invoice translation audit must cover the main list plus history, QR, installments, bulk entry, and print template/preview flows. Compare the `vi` and `en` finance key sets, then scan rendered child components for hard-coded Vietnamese UI strings.

**Why:** The main invoices page can appear fully translated while imported dialogs silently fall back to Vietnamese or bypass `t()` entirely.

**How to apply:** Reuse existing finance keys before adding new ones, keep both locale key sets synchronized, and distinguish editable UI labels from intentionally fixed Vietnamese content inside printed legal documents.