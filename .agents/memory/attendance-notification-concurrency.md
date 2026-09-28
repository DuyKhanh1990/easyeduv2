---
name: Attendance notification isolation
description: Protect attendance writes from notification load or delivery failures while preserving notification delivery.
---

Attendance notifications are side effects of a committed attendance change, not part of the attendance or wallet transaction. Keep delivery asynchronous so provider failures cannot roll back classroom or financial records.

**Why:** Bulk attendance can trigger many notification jobs, each with database lookups and downstream delivery. Unbounded fan-out competes with attendance and other center operations for a shared database connection budget.

**How to apply:** Bound notification work per server process and preserve queued jobs rather than dropping them under load. A local concurrency cap does not establish the global database budget; include the number of app processes and other database clients when tuning it. If durable retries become a requirement, use a persistent queue rather than relying on in-memory work.