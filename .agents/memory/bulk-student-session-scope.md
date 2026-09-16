---
name: Bulk student session scope
description: Scope bulk student-session operations by each student's class enrollment, not a single enrollment ID.
---

Bulk operations over student sessions must preserve a `studentId → studentClassId` mapping through the client request, activity-log prefetch, deletion, orphan handling, and recalculation.

**Why:** A student can have a different `student_classes` row from another student in the same class. Filtering a bulk request with only the first student's enrollment ID makes the other students appear to have zero sessions and can leave their sessions untouched.

**How to apply:** Use the per-student mapping for session queries, remaining-session/orphan checks, waiting/removal updates, and activity-log grouping. Keep a single enrollment ID only as a backward-compatible fallback for single-student requests.