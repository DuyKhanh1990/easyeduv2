---
name: Bulk teacher changes
description: Scope and behavior of the Change Teacher dialog for applying staff and role changes over a session range.
---

The Change Teacher dialog keeps its existing from/to session range behavior. Its editable assignment fields are teacher names and roles only; do not add teacher-specific hours. A changed role applies to the selected sessions in that range.

**Why:** the user clarified that per-teacher hour controls from the session-edit flow do not belong in bulk teacher changes.

**How to apply:** preserve the range picker and multi-teacher selection when updating this flow; persist role overrides across that range only when a role is explicitly changed.