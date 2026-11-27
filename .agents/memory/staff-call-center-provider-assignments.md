---
name: Staff call-center provider assignments
description: Product rule for shared call-center credentials and per-staff provider extensions.
---

Store provider connection credentials once per center in Settings. Assign extensions to each employee at each assigned center in the staff profile, with a separate labeled row for every provider configured at that center.

VoIP24H's REST click-to-call uses the center-level API Key/Secret and employee extension. Browser WebRTC registration additionally requires that employee's per-center SIP password; never use the API Secret as that password. Omicall has its own extension and may require a separate SIP password.

**Why:** REST API authentication does not register a browser SIP extension; WebRTC registration uses per-extension SIP credentials.

**How to apply:** Keep shared provider credentials at the center level and per-employee extensions/passwords in staff assignments. Keep each provider's credentials separate and show one row per configured provider and assigned center.
