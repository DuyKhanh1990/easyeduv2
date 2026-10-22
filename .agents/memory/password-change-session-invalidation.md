---
name: Password change session invalidation
description: User-selected security behavior after a self-service password change
---

After a user changes their own password, invalidate every web session and JWT on every device and require a fresh login. Keep the staff password ciphertext synchronized with the new password when the user has a staff profile; the one-way password hash remains the authentication source.

**Why:** The user explicitly chose to sign out all sessions and sign in again with the new password.

**How to apply:** Any future self-service password-change flow must update the credential atomically, revoke server-side sessions, and ensure already-issued JWTs fail validation.
