---
name: Staff list sort order
description: The staff list prioritizes active status, then most recently edited profiles.
---

Staff are grouped with active profiles first. Within each status group, sort by most recently edited first. Editing staff information must refresh the profile's edit timestamp so it moves to the top of its status group.

**Why:** The user requested recent edits to rise in the list without overriding the active-staff priority.

**How to apply:** Preserve active-first ordering, then sort each group by the staff profile's edit time descending. Keep ties deterministic.
