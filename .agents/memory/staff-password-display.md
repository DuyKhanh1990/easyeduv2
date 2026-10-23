---
name: Staff and student password display
description: Password visibility in staff/student edit dialogs and the approved reversible-encryption tradeoff
---

Staff and student login passwords use the normal one-way hash for authentication, but their authorized edit dialogs may reveal a password through the eye icon. Keep a separate AES-GCM ciphertext for this feature; never replace the hash or expose ciphertext in normal auth responses. Backfill missing ciphertext after a successful login. For legacy accounts, only recover a missing password when its hash confirms the known default; custom legacy passwords cannot be recovered from a one-way hash and require the next login or a password reset.

**Why:** The owner explicitly requires viewing saved staff/student passwords from edit dialogs, accepting the security tradeoff of reversible encryption.

**How to apply:** Encrypt on account creation/password change and backfill after successful staff or student login. Decrypt only through authorized password endpoints, preserving each entity's existing permission checks. Never infer a custom password from its hash or silently reset existing accounts.