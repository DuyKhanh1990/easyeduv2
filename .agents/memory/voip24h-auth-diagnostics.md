---
name: VoIP24H authentication diagnostics
description: Safe troubleshooting for VoIP24H authentication responses.
---

Authentication diagnostics may expose the provider HTTP status, numeric status code, and response field names only. Never log or return API keys, API secrets, raw provider payloads, or access-token values.

**Why:** The user approved diagnostics for the provider response mismatch while preserving the secrecy of credentials and tokens.

**How to apply:** Keep provider tokens server-side; if the response shape is unexpected, report only structural metadata needed to compare it with the documented contract.
