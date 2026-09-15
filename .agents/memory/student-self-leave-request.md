---
name: Student self-service leave requests
description: Rules for student and parent leave-request creation from the personal space page.
---

Self-service leave requests must derive the student from the authenticated account and derive locations from student-location assignments; never trust arbitrary student or location IDs from the client.

**Why:** The personal-space flow is separate from staff leave management, and the leave-request record stores one location per row while a student may be assigned to multiple locations.

**How to apply:** A student can submit only for their own record. A parent can submit only for linked students. The UI lists schedules in the requested date range with checkboxes; only selected schedules are persisted. When selected schedules span multiple assigned locations, create one pending request per affected location.

Leave-request notifications target the selected session teachers plus each selected class's managers, deduplicated by user account, and use the shared notification sender so in-app, realtime web, web push, and app push stay consistent.

**Why:** Staff need the request in the notification bell and supported push channels without exposing notifications to unrelated teachers or managers.

**How to apply:** Resolve staff IDs from class sessions/classes, map them to user IDs, send one notification per affected location/request, and keep notification failures from rolling back the saved leave request.