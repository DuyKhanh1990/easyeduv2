---
name: Bulk teacher changes
description: Scope and behavior of the Change Teacher dialog for applying staff and role changes over a session range.
---

The Change Teacher dialog keeps its existing from/to session range behavior. Its editable assignment fields are teacher names and roles only; do not add teacher-specific hours. A changed role applies to the selected sessions in that range.

**Why:** the user clarified that per-teacher hour controls from the session-edit flow do not belong in bulk teacher changes and asked for role changes to be visible in history.

**How to apply:** preserve the range picker and multi-teacher selection; persist role overrides across that range only when explicitly changed, and record before/after roles per affected session in the activity history.