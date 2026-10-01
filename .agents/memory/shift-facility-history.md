---
name: Facility shift history
description: Preserve prior assignment and attendance history when a facility is removed from a grouped shift setup.
---

When a facility is removed from a shift group, stop its current configuration and assignment rows, but do not hard-delete assignment or attendance history. Ended assignments must remain available to salary calculations for historical periods, using an inclusive effective end date in Asia/Bangkok.

**Why:** The user clarified that removing a facility should hide/stop current configuration while preserving historical assignment and attendance records.

**How to apply:** For future shift-group edits, deactivate only the removed facility's rows, preserve the other facility rows, and keep historical queries aware of ended assignments.