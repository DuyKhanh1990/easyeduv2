---
name: VoIP24H authentication diagnostics
description: Safe troubleshooting for VoIP24H authentication responses.
---

Authentication diagnostics may expose the provider HTTP status, numeric status code, and response field names only. Never log or return API keys, API secrets, raw provider payloads, or access-token values.

The provider's authentication page is internally inconsistent: its request summary lists a Bearer JWT header, while the executable authentication example omits it and describes this endpoint as the step that issues the token needed by later APIs. The schema table marks `isLonglive` as an optional boolean, while the example serializes it as a string. For the initial token request, follow the bootstrap flow without an invented Bearer value and prefer the schema table's boolean type; an omitted-field retry can diagnose compatibility.

The user also observed a successful provider response with `status: 200`, `data.expired`, and `data.isLongLive`, while the docs describe `1000`, `expried`, and `isLonglive`. Accept both response variants.

**Why:** The user approved safe diagnostics and supplied a real response showing the deployed provider contract differs from its documentation.

**How to apply:** Keep provider tokens server-side; if the response shape is unexpected, report only structural metadata needed to compare it with the documented contract. Do not add Authorization to the initial token request unless VoIP24H provides a separate pre-issued JWT and clarifies that it is required.
