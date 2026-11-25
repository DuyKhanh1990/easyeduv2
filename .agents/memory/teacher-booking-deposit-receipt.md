---
name: Teacher booking deposit receipt
description: Accounting design for student-selected teacher bookings funded from the deposit wallet.
---

For the immediate student-selected booking flow, save only the exact dates and shifts the student chose. A 10-session package can be paid in full and have 2 sessions booked now, leaving 8 available to schedule later. A previously paid package creates no new receipt; only its remaining sessions at the selected center are consumed by new bookings. A new package uses its configured total price and session count, requires enough deposit balance for the entire package, and creates one receipt under “Học phí theo đăng ký” with the full tuition amount and an equal deposit deduction.

The “Ví Đặt Cọc” payment label does not itself move balances. In the same transaction as the receipt and booking, debit “Đặt cọc” and credit “Học phí” once; do not perform another transfer or count the deposit as new cash income. Keep attendance on the established wallet deduction path and store a per-session price consistent with the package's actual paid amount.

The separate future flow may hold selected sessions until a cancellation deadline, then issue the receipt and create the class. For fixed student/teacher/date/shift sessions, prefer `classType: "tutor"` over free class: tutor classes use the normal `class_sessions` and `student_sessions` attendance and finance paths, while free classes have a distinct day-registration model.

**Why:** The user specified partial booking of a full package, with the unbooked sessions available for later scheduling, and teacher/student bookings must share a center. They also described delayed invoicing after a future cancellation window as a separate flow, not part of the immediate version.

**How to apply:** Link the receipt, exact booked sessions, and paired wallet entries atomically. Preserve the full package quantity on the invoice while counting only actual non-cancelled student sessions against the balance. Do not add the delayed cancellation deadline until its policy is specified.
