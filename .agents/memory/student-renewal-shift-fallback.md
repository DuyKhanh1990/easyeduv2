---
name: Student renewal shift fallback
description: Required source priority for shift metadata when renewal creates new class sessions.
---

When student renewal creates new class sessions, resolve shift metadata from the existing session for the same weekday first, then the class-level shift configuration, then the latest valid existing session. Never insert a null shift ID.

**Why:** Legacy and imported classes may have an empty class-level shift array while their existing sessions still have valid shift assignments; relying only on the class array causes a not-null violation during renewal.

**How to apply:** Use actual per-weekday schedule metadata as the recovery source. If neither class configuration nor existing sessions provide a valid shift, stop before insertion and return a clear class-configuration error.