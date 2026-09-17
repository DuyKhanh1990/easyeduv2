---
name: Makeup attendance state
description: Business rules for attendance status transitions around makeup sessions.
---

The original missed student session transitions from `makeup_wait` to the system-only `makeup_scheduled` state when a makeup placement succeeds. When the student is marked present in the makeup session, the original session transitions to `makeup_done`.

**Why:** Staff must be able to distinguish “makeup arranged” from “makeup completed” without allowing either state to be selected manually or counting an arranged-but-not-attended makeup as taught.

**How to apply:** Keep `makeup_scheduled` visible in attendance displays, exports, calendars, activity history, and relevant reports; exclude it from manual attendance option lists and teacher salary eligibility. Do not count it as attended or fee-deducting unless an explicit existing configuration says otherwise.