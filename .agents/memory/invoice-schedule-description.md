---
name: Invoice schedule description
description: Auto tuition invoice descriptions must show the student's selected weekday and shift times.
---

Automatic tuition invoice descriptions derive the `Thời gian` segment from the sessions selected for that student, not from the class-wide schedule alone. This applies to both initial scheduling and renewals. Deduplicate identical weekday/shift pairs and format times as `Thứ X (HH:mm-HH:mm)`.

**Why:** A class can have multiple weekly cycles or shifts while each student may attend only a subset; using the class schedule would put incorrect times on the student's invoice.

**How to apply:** When changing automatic tuition invoice generation, use the student's filtered/new session set or renewal cycle weekdays and resolve each shift template's start/end time before composing the description. Format all invoice date ranges as `dd/MM/yyyy`.