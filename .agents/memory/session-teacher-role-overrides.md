---
name: Session teacher role overrides
description: Rules for per-session teacher role selection and how it interacts with class-wide assignments.
---

Teacher role changes made in the “Update session” dialog apply only to that class session. Keep them separate from the class-wide teacher assignment. Persist only explicit per-session overrides; when an override is cleared, derive the role from the class configuration and the system default-role rules. Any operation that replaces a session's teacher roster must also reconcile its time-assignment rows: preserve selected teachers' custom intervals, default new teachers to the full shift, and remove rows for deselected teachers.

**Why:** The requested role change must not modify other sessions or the class-wide teacher assignment, and sessions without an explicit override should continue to follow the existing defaults. Calendar cards combine session teachers with time-assignment rows, so stale rows for removed teachers can make the two surfaces disagree.

**How to apply:** When session schedule rows are reordered in “preserve slots” mode, carry the override with the moved schedule along with its teacher IDs; do not change the class-level teacher configuration. When a teacher roster changes, synchronize the roster and time-assignment overlay in the same transaction.