---
name: Customers class-view scope
description: Scope constraint for future changes to the Customers page's class-based view.
---

Changes requested for the Customers “Theo lớp” view should remain isolated to that view. Do not alter attendance behavior or affect other Customers views. The monthly attendance grid may use a dedicated read-only, month-filtered query when explicitly requested.

On `/customers`, class filters must use the same enrollment records shown in the “Lớp học” column and “Theo lớp” view (`student_classes` joined to `classes`), not the denormalized class ID list on the student profile. Match a student when any selected class has an enrollment record, without adding a status condition that would make filter results disagree with the class roster.

**Why:** The user explicitly limited the class-view work to avoid affecting existing systems and business workflows, then chose month-scoped loading to avoid fetching a full class history for the grid. They also requested quick month selection, a persistent month control while scrolling, and attendance cards styled like their reference. They confirmed the visible class column and actual enrollment are the source of truth for class filtering.

**How to apply:** Use an `EXISTS` enrollment check for class filtering to avoid duplicate student rows; preserve other filters and view modes. Prefer conditional rendering and class-view-specific presentation in the Customers page/table. For its monthly schedule, fetch only the selected class and month using existing attendance status semantics; keep the month picker sticky, make it quick to choose a month/year, show weekday in each date header with vertical day dividers, and use rounded status-colored cards with icons. Keep cells without a scheduled lesson blank, keep dates out of individual attendance cards, and leave the Classes attendance workflow and all other view modes unchanged.
