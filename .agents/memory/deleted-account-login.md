---
name: Deleted account login
description: Authentication behavior for staff or student profiles removed from the system.
---

Deleting a staff or student profile must deactivate its linked users row instead of deleting the user record, because historical foreign keys may still reference that user. Login should also reject orphaned user records that have neither a staff nor student profile.

An orphaned username may be reclaimed only after confirming that no staff or student profile still references its user row. Creation can reactivate that row; changing an existing profile to the orphaned username must preserve the existing profile's user identity and safely retire the orphaned username.

**Why:** Removing only a profile previously left the username and password usable. It also made customer-code generation disagree with username uniqueness, producing records whose student code and login account no longer matched.

**How to apply:** Preserve the user row for history, set `isActive` false during profile deletion, distinguish linked accounts from reclaimable orphans in duplicate checks, and keep all account/profile changes in one transaction.

Student deletion must not cascade through class enrollments. If `student_classes` still references the student, block deletion and return a user-facing message listing the linked class names/codes so staff can remove the student from those classes first.

**Why:** Production data commonly retains class history; surfacing the raw foreign-key error is confusing, while automatic cascading would silently destroy enrollment history.

**How to apply:** Check enrollments inside the same deletion transaction before deleting the student, return a conflict response with structured class details, and display the server message on `/customers`.

The same deletion guard applies to invoices linked through `invoices.student_id`: any existing invoice blocks deletion and should be listed with its code and payment status alongside class links.

**Why:** Invoice rows are financial history and the foreign key intentionally protects them from accidental removal when a customer profile is deleted.

**How to apply:** Query invoices within the deletion transaction, return them in the structured conflict response, and keep the existing student/invoice records unchanged.