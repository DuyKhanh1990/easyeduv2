---
name: Teacher booking deposit receipt
description: Accounting design for student-selected teacher bookings funded from the deposit wallet.
---

For the immediate student-selected booking flow, save only the exact dates and shifts the student chose. A 10-session package can be paid in full and have 2 sessions booked now, leaving 8 available to schedule later. A previously paid package creates no new receipt; only its remaining sessions at the selected center are consumed by new bookings. For a previously paid per-session package, invoice-item quantity is the session entitlement; the catalog package may be configured as one session only to represent the unit price. Enforce the remaining invoice quantity, not the catalog session count. A new package uses its configured total price and session count, requires enough deposit balance for the entire package, and creates one receipt under “Học phí theo đăng ký” with the full tuition amount and an equal deposit deduction.

Payments categorized as “Học phí theo đăng ký” are still tuition: when paid, their tuition portion must credit the Học phí wallet so attendance can deduct it normally. Wallet accounting must recognize this category consistently for direct payments and installment schedules.

The “Ví Đặt Cọc” payment label does not itself move balances. In the same transaction as the receipt and booking, debit “Đặt cọc” and credit “Học phí” once; do not perform another transfer or count the deposit as new cash income. Keep attendance on the established wallet deduction path and store a per-session price consistent with the package's actual paid amount.

In the delayed-finalization flow, confirming the booking first creates only a cancellable reservation/slot hold. It must not yet create the official 1-1 class/session records, receipt, or wallet movements. If the student cancels before the configured deadline, release the held slots and leave package/wallet balances unchanged. If the deadline passes without cancellation, finalize the selected sessions as a `classType: "tutor"` class and issue the applicable tuition receipt. “One hour” was given as an example; treat the duration as configurable until the user confirms it.

For fixed student/teacher/date/shift sessions, prefer `classType: "tutor"` over free class: tutor classes use the normal `class_sessions` and `student_sessions` attendance and finance paths, while free classes have a distinct day-registration model.

Only paid or confirmed invoices categorized “Học phí theo đăng ký” should supply packages to this self-booking flow. Count only sessions booked through this flow against those packages; ordinary class history shares the same catalog package ID and must not consume this separate entitlement.

One booking request may contain multiple shifts across different dates. Changing the focused calendar date must preserve the other selected date/shift pairs; validate every date and create the chosen sessions together in one tutor-class registration.

**Why:** The user wants learners to pick available shifts on several days before submitting once. This extends the existing partial-package rule: unbooked sessions remain available for later scheduling, and all booked dates must still share the selected center. For the future delayed-finalization flow, official class and invoice generation waits until the cancellation window expires without cancellation.

**How to apply:** Link the receipt, exact booked sessions, and paired wallet entries atomically at finalization. Preserve the full package quantity on the invoice while counting only actual non-cancelled self-booked sessions against the balance. Keep the pre-deadline reservation separate from official class, invoice, and wallet records. For immediate multi-date booking, validate each selected day independently and persist all chosen date/shift pairs together.
