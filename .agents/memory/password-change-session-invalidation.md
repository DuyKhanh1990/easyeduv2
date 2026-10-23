---
name: Password change session invalidation
description: User-selected security behavior after a self-service password change
---

After a user changes their own password, invalidate every web session and JWT on every device and require a fresh login. For student accounts, every creation path (including Excel import) and password change must keep the encrypted display value synchronized; the one-way password hash remains the authentication source. Preserve the existing admin edit-password flow unless explicitly asked to change it.

**Why:** The user explicitly chose to sign out all sessions and sign in again with the new password, and asked that self-service password changes update the same stored display value without altering the existing edit flow.

**How to apply:** Any future self-service password-change flow must update the credential atomically, revoke server-side sessions, and ensure already-issued JWTs fail validation. Student creation/import and edit paths must save both the auth hash and encrypted display value. A hash-only legacy account cannot reveal its prior password; the password must be re-entered or reset once to populate the display value.
