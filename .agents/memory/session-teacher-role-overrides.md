---
name: Session teacher role overrides
description: Rules for per-session teacher role selection and how it interacts with class-wide assignments.
---

Teacher role changes made in the “Update session” dialog apply only to that class session. Keep them separate from the class-wide teacher assignment. Persist only explicit per-session overrides; when an override is cleared, derive the role from the class configuration and the system default-role rules.

**Why:** The requested role change must not modify other sessions or the class-wide teacher assignment, and sessions without an explicit override should continue to follow the existing defaults.

**How to apply:** When session schedule rows are reordered in “preserve slots” mode, carry the override with the moved schedule along with its teacher IDs; do not change the class-level teacher configuration.