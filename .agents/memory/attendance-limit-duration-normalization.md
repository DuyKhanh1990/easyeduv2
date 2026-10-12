---
name: Attendance limit duration normalization
description: User-facing behavior when day/hour/minute fields exceed normal component ranges.
---

When saving attendance limits, carry overflow minutes into hours/days and overflow hours into days, preserving the exact total allowed duration. Reflect the normalized values in the inputs after a successful save. Standard existing configurations remain unchanged; do not bulk-migrate or rewrite saved settings.

**Why:** The UI previews aggregate durations, but the API requires minute and hour components to stay within 0–59 and 0–23. Users may enter a large value such as 1500 minutes and expect it to be carried into larger units without changing the attendance window.

**How to apply:** Normalize in the save flow before calling the validated API. Keep the server's canonical component validation and avoid changing persisted settings until the user saves.
