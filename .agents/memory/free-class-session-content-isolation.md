---
name: Free-class session content isolation
description: Durable boundary for assigning library content to flexible/free-class dates.
---

Flexible classes have no `class_sessions`, so their session content must use a dedicated table keyed by `classId + sessionDate`, with nullable `studentId` for class-wide versus individual assignments.

**Why:** Reusing `session_contents` would require synthetic IDs to satisfy regular-class foreign keys and could write free-class data into regular attendance/content workflows.

**How to apply:** Keep staff CRUD and student/parent reads on free-specific endpoints. Validate staff access through active/waiting registrations and validate personal targets against registrations for the same class/date. Do not modify regular session-content tables for free classes.