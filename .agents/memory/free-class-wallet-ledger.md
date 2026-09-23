---
name: Free-class wallet ledger
description: Tuition wallet behavior for free-class attendance
---

## Rule
Free-class attendance must write the same immutable `student_wallet_transactions` ledger used by regular attendance. A transition into the fee-deducting attended state creates a debit; changing back to a non-deducting state creates a credit reversal. The amount comes from the invoice item unit price, with the class fee package as fallback.

**Why:** Free classes intentionally do not have `student_sessions`, so the regular attendance wallet path cannot see them. Updating only `free_class_registrations` makes the class summary disagree with the tuition wallet and its history.

**How to apply:** Keep the registration update and wallet write in one transaction, link the entry to class/date, and apply the configured `present` attendance fee rule rather than hardcoding deduction behavior.