---
name: Staff calendar attendance permissions
description: Intended attendance and review permissions for staff using /my-space/calendar.
---

Staff using `/my-space/calendar` should be able to mark attendance and write student reviews for their assigned sessions by default. Do not require general `/schedule` or `/classes` edit permission for these staff-calendar actions. Attendance may be time-restricted only when an `attendanceLimit` is configured; reviews are not subject to that time limit.

For the calendar permission matrix, View is always enabled and allows attendance, notes, reviews, and assigning/adding content only within an assigned regular session or effective free-class assignment. Create is only for adding students; Edit applies to due-date updates on assigned content. View All and Delete do not apply. Education behavior must remain unchanged.

**Why:** The user clarified the expected staff-calendar behavior after a teacher encountered “Bạn không có quyền chỉnh sửa lịch học” while taking attendance, and specified the My Space permission boundaries.

**How to apply:** Keep authorization scoped to the staff member’s assigned class/session or effective free-class registration/day. Preserve attendance-limit enforcement separately; use My Space-specific routes for calendar content operations and do not grant broad schedule-edit access or change Education behavior.