---
name: Invoice class import student groups
description: Status-group behavior for importing students from classes into direct invoice entry.
---

Class-based direct invoice entry must support importing students with `student_classes.status` set to `waiting`, `active`, or both. Keep active (official students) selected by default to preserve the previous behavior.

**Why:** The previous class picker imported only active students; the user requested waiting-only and combined imports.

**How to apply:** Keep the group filters in the class picker and fetch only the selected enrollment groups when adding invoice rows. Do not silently include or exclude a group.
