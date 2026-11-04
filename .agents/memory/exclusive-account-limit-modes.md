---
name: Exclusive account-limit modes
description: Preserve existing HRM limits while selecting whether HRM or student/parent limits are enforced.
---

**Rule:** Keep HRM's existing enforcement and saved `staffLimit` value intact. Store the selected quota mode independently; when no mode is saved, interpret it as HRM. Selecting a side only opens its editor; Apply saves its limit and activates that mode atomically. Require the new limit to be at least the current active count for either side, and leave the prior limit/mode unchanged if validation fails.

**Why:** The user explicitly requires existing centers' HRM settings (including custom limits such as 100) and HRM behavior to survive code updates unchanged; the new student/parent limit is an optional alternative, not a replacement.

**How to apply:** Gate existing HRM create/activation checks by the active mode while preserving saved `staffLimit`. Gate student creation/import checks by the same mode. Make the Apply action validate the selected side's active count and update only that side's numeric limit plus the active-mode key; never clear the other side's saved value.
