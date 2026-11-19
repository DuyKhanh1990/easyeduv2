---
name: BIDV QR short transfer memo
description: Required structure and length for BIDV invoice QR transfer content.
---

BIDV invoice QR transfer content uses the VA first, followed by `thanh toan hoa don` and the sanitized invoice code. Keep the complete `addInfo` within 50 characters and use only plain alphanumeric text and spaces; do not put long invoice descriptions or schedules in the bank memo.

**Why:** VietQR Quick Link documents a 50-character description limit, and bank apps may show even less. The VA remains first for matching while the short label gives the payer a readable purpose.

**How to apply:** Keep this format shared between Finance invoices and `/my-space/invoices`. Leave the full description and schedule details on the invoice itself.
