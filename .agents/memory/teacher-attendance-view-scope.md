---
name: Teacher attendance overview view scope
description: Access scope for the Chấm công giáo viên tab on /learning-overview.
---

For `/learning-overview#cham-cong-giao-vien`, ordinary `canView` access must return only attendance rows where the logged-in staff member is the assigned teacher. `canViewAll` and Super Admin retain unrestricted visibility.

**Why:** the user asked that staff with View permission not see classes assigned to other teachers.

**How to apply:** enforce the permission and staff scope in the server read endpoint and apply the same scope to count/pagination queries. Do not infer broad visibility from the page tab being visible in the UI.
