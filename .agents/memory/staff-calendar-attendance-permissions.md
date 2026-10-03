---
name: Staff calendar attendance permissions
description: Intended attendance and review permissions for staff using /my-space/calendar.
---

Staff using `/my-space/calendar` should be able to mark attendance and write student reviews for their assigned sessions by default. Do not require general `/schedule` or `/classes` edit permission for these staff-calendar actions. Attendance may be time-restricted only when an `attendanceLimit` is configured; reviews are not subject to that time limit.

**Why:** The user clarified this is the expected staff-calendar behavior after a teacher encountered “Bạn không có quyền chỉnh sửa lịch học” while taking attendance.

**How to apply:** Keep authorization scoped to the staff member’s assigned class/session or free-class registration/day. Preserve the existing attendance-limit enforcement separately; do not grant broad schedule-edit access to unblock attendance or reviews.