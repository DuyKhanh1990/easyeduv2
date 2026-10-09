---
name: Fresh status catalog selectors
description: Freshness rules for course, program, and fee-package selectors after active-state changes.
---

Course, program, and fee-package selectors used for new work must load current active options when the creation page or dialog opens. Query invalidation is local to one app instance, so a change in another tab or another user's session may not update its cache; the global query client also disables refetch-on-window-focus.

**Why:** An inactive item must not remain selectable for new work because a different tab or user still has an old cached list.

**How to apply:** Use fresh queries on mount/open for new class, schedule, and invoice flows; disable critical selectors while their request is in flight. In edit/history flows, continue including the currently linked inactive ID so existing relationships remain visible.
