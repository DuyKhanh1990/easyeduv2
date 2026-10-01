---
name: Wallet recipient search
description: Recipient lookup rules for student wallet transfers
---

## Rule
Wallet transfer recipient lookup must search on the server with the same location scope used when submitting the transfer. The UI must not preload a capped customer list and then filter locally.

**Why:** A student can be visible in the customer area but fall outside the first page/cap of a preloaded list, making the recipient picker appear incomplete. Location authorization must still prevent cross-scope transfers.

**How to apply:** Pass the search term to a dedicated recipient endpoint, cap only the number of matching results, and keep the final `getStudent` authorization check plus atomic wallet validation at transfer time.

## Same-student transfers
Allow transferring between one student's two wallet categories only: an Học phí credit debits available Đặt cọc, and a Đặt cọc credit debits available Học phí. Require a positive source balance and allow one direction per transfer; this is reallocation, not a top-up.

**Why:** A same-category transfer to the same student would only create offsetting ledger entries, while a negative wallet must never fund an outgoing transfer.

**How to apply:** Validate the source category against the locked ledger balance in the transfer transaction, and mirror the same cross-category limits in the recipient dialog.