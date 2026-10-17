---
name: My Space student calendar curriculum visibility
description: Hide curriculum-type content from student and parent calendar views without changing staff calendar visibility.
---

On `/my-space/calendar`, students and parents must not see content whose type is `Giáo trình` or `curriculum`. This applies to common and personalized content, including regular, free, and test sessions. Staff calendar visibility remains unchanged.

**Why:** The user requested that curriculum content be hidden specifically from the student/parent side of My Space calendar.

**How to apply:** Filter curriculum content from student/parent calendar detail API responses and the student calendar renderer. Keep other content types and all staff calendar behavior unchanged.
