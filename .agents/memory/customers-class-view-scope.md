---
name: Customers class-view scope
description: Scope constraint for future changes to the Customers page's class-based view.
---

Changes requested for the Customers “Theo lớp” view should remain isolated to that view. Do not alter attendance behavior or affect other Customers views. The monthly attendance grid may use a dedicated read-only, month-filtered query when explicitly requested.

**Why:** The user explicitly limited the class-view work to avoid affecting existing systems and business workflows, then chose month-scoped loading to avoid fetching a full class history for the grid. They also requested quick month selection, a persistent month control while scrolling, and attendance cards styled like their reference.

**How to apply:** Prefer conditional rendering and class-view-specific presentation in the Customers page/table. For its monthly schedule, fetch only the selected class and month using existing attendance status semantics; keep the month picker sticky, make it quick to choose a month/year, show weekday in each date header with vertical day dividers, and use rounded status-colored cards with icons. Keep cells without a scheduled lesson blank, keep dates out of individual attendance cards, and leave the Classes attendance workflow and all other view modes unchanged.
