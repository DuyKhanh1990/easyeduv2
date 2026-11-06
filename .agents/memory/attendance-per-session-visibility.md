---
name: Attendance per-session visibility
description: Read scope for staff with View permission on the attendance page.
---

On `/attendance`, staff with ordinary View permission should see regular sessions assigned to them, not all sessions of a class merely because they appear in the class-wide teacher list. A class manager retains access to all sessions in that class. View All and Super Admin remain unrestricted.

For free classes, use the effective assignment order: student/date override, day assignment, then class-level teacher fallback. A class manager still sees all class entries.

**Why:** The user clarified that replacing a teacher for one session must stop that teacher from seeing the other teachers’ sessions, while class managers continue managing the whole class.

**How to apply:** Enforce this at the `/api/attendance` read query, using current session assignments for regular classes and effective registration/day/default assignments for free classes. Keep location and student-scope filters unchanged.
