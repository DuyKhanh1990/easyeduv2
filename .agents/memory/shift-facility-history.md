---
name: Facility shift history
description: Keep shift rows independent by facility while preserving assignment and attendance history when one is stopped.
---

Shift configuration and assignment rows are independent per facility. Selecting multiple facilities is only a bulk-create convenience: it creates one row per facility, and later edits or stops affect only the selected row. Do not hard-delete assignment or attendance history. Ended assignments must remain available to salary calculations for historical periods, using an inclusive effective end date in Asia/Bangkok.

**Why:** The user clarified that each facility manages its own rows and that stopping a row should preserve historical assignment and attendance records. Older multi-location edit forms can still submit several entries, so rejecting every multi-entry update can block edits.

**How to apply:** When a user selects multiple facilities during creation, save separate rows. For later edits, select only the submitted entry for the row's facility and update that row; ignore sibling entries. For deactivation, scope to one row and keep historical queries aware of ended assignments.