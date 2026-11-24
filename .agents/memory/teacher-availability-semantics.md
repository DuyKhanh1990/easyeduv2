---
name: Teacher availability semantics
description: Optional teacher availability registrations constrain class scheduling only while active.
---

Teacher availability registrations are optional constraints. If a teacher has no availability registration active for the class location and scheduled date, treat them as freely available. If at least one registration is active for that location and date, the scheduled weekday and shift must match a registered availability; otherwise report that the teacher is unavailable. Keep this validation separate from class-overlap checks, which continue to compare scheduled sessions.

**Why:** The user clarified that not every teacher needs to register free time; registrations only limit availability during their active period.

**How to apply:** For class creation, schedule edits, and teacher changes, evaluate registrations by teacher, class location, scheduled date, weekday, shift, and effective-from/to dates. Do not treat a missing registration as a conflict.
