---
name: VoIP24H authentication diagnostics
description: Safe troubleshooting for VoIP24H authentication responses.
---

Authentication diagnostics may expose the provider HTTP status, numeric status code, and response field names only. Never log or return API keys, API secrets, raw provider payloads, or access-token values.

The provider's authentication page is internally inconsistent: its request summary lists a Bearer JWT header, while the executable authentication example omits it and describes this endpoint as the step that issues the token needed by later APIs. For the initial token request, follow the executable example and do not invent a Bearer value.

**Why:** The user approved diagnostics for the provider response mismatch while preserving the secrecy of credentials and tokens.

**How to apply:** Keep provider tokens server-side; if the response shape is unexpected, report only structural metadata needed to compare it with the documented contract. Do not add Authorization to the initial token request unless VoIP24H provides a separate pre-issued JWT and clarifies that it is required.
