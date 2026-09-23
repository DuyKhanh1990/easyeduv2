---
name: Student detail free-class sources
description: Data sources required for the student's class-detail view
---

## Rule
The student detail “Lớp học” view must not infer all activity from `student_sessions`. Free-class registrations and attendance live in `free_class_registrations`, and invoices with a student plus `class_id` must also make that class visible.

**Why:** Free classes intentionally have no fixed `class_sessions` or regular `student_sessions`; relying only on those tables makes a registered/attended free-class student appear to have zero sessions. Filtering classes only from enrollments/sessions also hides class-linked invoices.

**How to apply:** Keep regular and free-class session reads separate, then merge their results at the student-class response boundary. Union class IDs from student enrollments, regular student sessions, and class-linked tuition invoices before building the response.