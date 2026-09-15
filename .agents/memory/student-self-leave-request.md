---
name: Student self-service leave requests
description: Rules for student and parent leave-request creation from the personal space page.
---

Self-service leave requests must derive the student from the authenticated account and derive locations from student-location assignments; never trust arbitrary student or location IDs from the client.

**Why:** The personal-space flow is separate from staff leave management, and the leave-request record stores one location per row while a student may be assigned to multiple locations.

**How to apply:** A student can submit only for their own record. A parent can submit only for linked students. When multiple assigned locations apply, create one pending request per assigned location and attach the matching schedules automatically.