---
name: Teacher picker department eligibility
description: Eligibility rule for staff shown in class-session teacher pickers.
---

Class-session teacher pickers should include staff only when their staff-page assignments include the system department named “Phòng Đào tạo”.

**Why:** the user specified that only staff assigned to the default system Training department should be selectable as teachers.

**How to apply:** check the staff member's assignment department `isSystem` flag and exact department name; do not infer eligibility from role names alone.