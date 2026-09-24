---
name: Live attendance test safety
description: Safety prerequisite for controlled attendance tests on the external live database.
---

## Rule

Before requesting an attendance test on the live database, verify the exact student-session records and whether they have invoice allocations, effective tuition amounts, and fee-deducting statuses. A class or student being described as "test" is not sufficient evidence that a status change is financially isolated. If the records cannot be verified beforehand, use a database copy or choose a different test.

**Why:** An attendance test on records described as isolated nevertheless encountered invoice allocations and created tuition-wallet debit transactions. Invoice payment status alone does not rule out a wallet effect.

**How to apply:** Ask for the target session IDs or a way to identify them *before* the action; inspect relevant links and fee rules read-only, explain possible notifications and ledger effects, and avoid live attendance if uncertain. Never silently reverse attendance or edit ledger records after a test; first establish the exact side effects and obtain the user's direction.