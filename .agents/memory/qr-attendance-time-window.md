---
name: QR attendance time zone
description: Rules for the QR attendance display window and local schedule interpretation.
---

QR attendance treats class start/end values as Asia/Bangkok wall-clock times, while the server process may run in UTC. The scan flow always shows an upcoming eligible session from at least 15 minutes before start; a larger configured early-attendance allowance expands visibility, but the button stays disabled until the staff role's actual opening time.

**Why:** Interpreting a stored 08:00 schedule in the Node process timezone can shift the QR window and allow or hide attendance at the wrong local time.

**How to apply:** Keep QR display and mutation enforcement on the same role-scoped attendance-limit semantics. Preserve the separate 15-minute preview window and report the exact opening time when the button is disabled.

Student QR tokens are provisioned automatically on the first authorized student-detail load and then reused. The profile UI renders the QR below the avatar and opens a larger view on click; there is no create/regenerate action in the normal flow.

**Why:** Staff should have one stable QR per student without an extra setup step or accidental replacement.

**How to apply:** Keep the GET endpoint idempotent and concurrency-safe; never generate a different token for each render or expose token creation as a required UI action.