---
name: Wallet recipient search
description: Recipient lookup rules for student wallet transfers
---

## Rule
Wallet transfer recipient lookup must search on the server with the same location scope used when submitting the transfer. The UI must not preload a capped customer list and then filter locally.

**Why:** A student can be visible in the customer area but fall outside the first page/cap of a preloaded list, making the recipient picker appear incomplete. Location authorization must still prevent cross-scope transfers.

**How to apply:** Pass the search term to a dedicated recipient endpoint, cap only the number of matching results, and keep the final `getStudent` authorization check plus atomic wallet validation at transfer time.