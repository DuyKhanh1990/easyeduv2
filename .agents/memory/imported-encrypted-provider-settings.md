---
name: Imported encrypted provider settings
description: Behavior for encrypted third-party credentials after importing a project into a new environment.
---

Encrypted provider credentials may be unreadable after an import when the original encryption secret is not present in the new environment.

**Why:** Returning a hard error while reading the settings prevents an administrator from seeing the non-secret endpoint fields or replacing the stale credential.

**How to apply:** Treat decryption failure as a credential-replacement state: expose only a boolean status, keep the key empty, preserve safe configuration fields, and require the administrator to enter a new credential before provider requests run.