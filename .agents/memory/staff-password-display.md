---
name: Staff password display
description: Staff dialog password visibility and the approved reversible-encryption tradeoff
---

Staff login passwords use the normal one-way hash for authentication, but the staff UI is also approved to reveal the password through the eye icon. Keep a separate AES-GCM ciphertext for this feature; never replace the hash or expose ciphertext in normal auth responses.

**Why:** The owner explicitly requires viewing the saved staff password from the edit dialog, accepting the security tradeoff of reversible encryption.

**How to apply:** Encrypt on staff creation/password change, decrypt only through an authorized staff-password endpoint, and preserve location/super-admin access checks. Existing accounts created before ciphertext storage cannot have their old password recovered; set a new password once to populate it.