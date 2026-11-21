---
name: Staff call-center provider assignments
description: Product rule for shared call-center credentials and per-staff provider extensions.
---

Store provider connection credentials once per center in Settings. Assign extensions to each employee at each assigned center in the staff profile, with a separate labeled row for every provider configured at that center.

VoIP24H uses the center-level API Key/Secret and requires only the employee's extension. Omicall has its own extension and may require a separate SIP password. Do not reuse one provider's extension or password for another provider.

**Why:** The user wants one staff interface that makes multi-provider assignments clear without duplicating configuration screens; VoIP24H's dial API authenticates with the shared provider account rather than a per-extension password.

**How to apply:** When adding a call-center provider, keep shared credentials in its center configuration and add provider-specific fields to the existing staff assignment section. Show one row per configured provider and assigned center; do not render inactive/unconfigured providers.
