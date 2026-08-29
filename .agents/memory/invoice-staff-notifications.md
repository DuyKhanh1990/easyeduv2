---
name: Invoice notifications for staff-targeted invoices (EasyEdu finance)
description: How "hoá đơn" (Thu/Chi) notifications are resolved when the invoice target is a staff member rather than a student, and where a payment path was missing notifications entirely.
---

## Client contract for staff-targeted invoices
When the "Tên" field in the invoice create dialog is a staff member (not a student),
the client sends `studentId: null` and a pre-formatted `subjectName: "[CODE] Full Name"`.
It does NOT send the staff's id in `studentId`. Any server-side logic that resolves
"who does this invoice concern" must therefore branch on `subjectName`'s `^\[CODE\]`
prefix (matched against `staff.code`) whenever `studentId` is absent — not only when
a `studentId`-shaped value happens to match a `staff.id`.

**Why:** a regression where the client stopped sending staff ids as `studentId` silently
broke staff-targeted "invoice created" notifications (payment notifications were fine
because that path already used the subjectName-regex fallback). Confirmed by comparing
DB `notifications` rows for old vs. new invoices with the same staff subject.

## Recipient policy
Per explicit user decision: for a staff-targeted invoice (Thu or Chi), both the
"created" and "paid" notifications should go ONLY to that staff member — never to the
creator/admin. Student-targeted invoices keep the original behavior (student + creator
for "created"; student only for "paid", via `resolveInvoiceRecipientUserIds`).

## Salary payments bypassed notifications entirely
Partial/incremental "Chi" payments (e.g. salary) go through a separate endpoint/flow
(`append-salary-payment` style) rather than the general invoice PATCH handler. Any new
payment-related side effect (notifications, wallet entries, etc.) added to the main
invoice PATCH flow must also be added to this separate salary-payment path, or it will
silently never fire for that invoice type — there's no shared code path.
