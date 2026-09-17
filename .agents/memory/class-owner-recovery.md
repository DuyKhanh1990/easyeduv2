---
name: Legacy class owner recovery
description: How class visibility handles historical classes whose original creator is missing.
---

Legacy class ownership must be recovered only from an authoritative class-creation audit event. A missing `createdBy` value is never a wildcard; unresolved rows stay limited to explicitly assigned teachers/managers until an administrator verifies another source.

**Why:** Guessing from later edits, teachers, or managers can grant access to the wrong staff member and is not reversible as a reliable historical fact.

**How to apply:** When importing or deploying across centers, backfill only from the original creation audit record, keep the operation idempotent, and report unresolved classes for manual reconciliation.