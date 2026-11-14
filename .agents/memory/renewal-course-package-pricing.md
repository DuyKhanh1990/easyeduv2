---
name: Renewal course-package pricing
description: Pricing behavior for fixed-price course packages during class renewals and their automatic invoices.
---

Class renewals must price a “thu theo khóa” package like invoice creation: use the full package amount as the line unit price and do not multiply it by the renewed session count. The quantity records the actual number of extended sessions for reference. Apply promotion, surcharge, and VAT to the fixed package amount, and ensure the automatic invoice line and totals match the renewal preview.

Keep the per-session price (`package fee / configured package sessions`) on newly created student-session records for session-level accounting; it is not the renewal invoice line price for a fixed-price course package.

**Why:** The user requires renewal pricing to match invoice creation, where course package quantity is informational. Charging by session in the renewal flow made a shorter or longer extension change the fixed course price.

**How to apply:** When updating class renewal pricing, separate the fixed invoice line price from the per-session accounting price. For “buổi” packages, continue multiplying the per-session price by the extension count.
