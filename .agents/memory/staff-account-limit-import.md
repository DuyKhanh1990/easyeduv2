---
name: HRM account cap on Excel import
description: Keep staff Excel imports within the active-account limit configured in Settings.
---

**Rule:** Enforce the configured active-staff account limit for Excel imports as well as manual creation. Disable imports at the limit, and reject an entire import before creating any rows when its active records exceed the remaining slots. Keep the server-side per-record guard as protection against concurrent changes.

**Why:** The user reported that Excel imports could bypass the HRM account cap while manual creation was blocked.

**How to apply:** Fetch the current limit and active-account count before sending import requests. Compare only records that would be created as active, reject the batch without partial inserts when it exceeds capacity, and refresh the displayed limit after successful imports.
