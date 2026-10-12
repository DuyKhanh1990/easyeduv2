---
name: Attendance limit role scope
description: Product rules for role selection and zero-duration attendance windows.
---

An empty applicable-role selection means the attendance limit applies to no role. A non-empty selection applies when a staff member has at least one selected role. A 0/0 time window means attendance is permitted during the scheduled start minute; comparisons ignore seconds. Super Admin bypasses the limit.

**Why:** The previous empty-list behavior applied the limit to every staff role, and the write API bypassed validation for a 0/0 window. The user explicitly chose empty = none and minute-level start-time precision.

**How to apply:** Keep the education-config helper text, regular web/mobile attendance writes, and QR availability consistent. An absent saved setting remains unrestricted. Legacy saved empty role lists now mean no restriction under the user-approved semantics.
