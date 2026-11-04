---
name: Exclusive account-limit modes
description: Preserve existing HRM limits while selecting whether HRM or student/parent limits are enforced.
---

**Rule:** Keep HRM's existing behavior and saved `staffLimit` value intact. Store the selected quota mode independently; when no mode is saved, interpret it as HRM. Student/parent mode may be enabled only after a positive student limit is configured. Switching modes must not overwrite either numeric limit.

**Why:** The user explicitly requires existing centers' HRM settings (including custom limits such as 100) and HRM behavior to survive code updates unchanged; the new student/parent limit is an optional alternative, not a replacement.

**How to apply:** For future quota changes, gate existing HRM create/activation checks by the mode without changing the HRM limit's read/write semantics. Gate student creation/import checks by the same mode, and update only the mode key when switching.
