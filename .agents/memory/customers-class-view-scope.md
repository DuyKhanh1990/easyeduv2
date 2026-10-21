---
name: Customers class-view scope
description: Scope constraint for future changes to the Customers page's class-based view.
---

Changes requested for the Customers “Theo lớp” view should remain isolated to its UI. Do not alter APIs, data, or business behavior, and do not affect other Customers views or unrelated systems unless the user explicitly asks.

**Why:** The user explicitly limited the class-view work to UI changes so existing systems and business workflows remain unaffected.

**How to apply:** Prefer conditional rendering and class-view-specific presentation in the Customers page/table. Keep other view modes and shared business logic unchanged.
