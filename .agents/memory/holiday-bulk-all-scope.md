---
name: Holiday bulk all-scope rule
description: Business meaning of “all” in the bulk holiday update dialog on the schedule page.
---

When locations, teachers, and holidays are left at “Tất cả”, every indexed class session whose date falls inside the selected holiday ranges must be included, regardless of whether the date is past or future and regardless of class or session status. Only apply location or teacher filtering when the user explicitly selects a subset.

**Why:** Schedules may be created retroactively, and users expect “Tất cả” to mean the complete holiday date scope without hidden status or current-date exceptions.

**How to apply:** Keep only the holiday date-range match plus explicit user-selected location/teacher filters. A valid session index remains a structural prerequisite because exclusion and compensating-session logic depend on schedule order.