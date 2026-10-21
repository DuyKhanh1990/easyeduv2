---
name: Teacher salary package role rates
description: Compatibility rule for multi-role standing-teacher salary packages.
---

Use `role_rates` as the source of truth for packages supporting multiple roles. Keep legacy `role`, `unit_price`, and `ranges` synchronized from the first role-rate row so older readers continue to work. When reading a package with no role-rate rows, fall back to those legacy fields.

**Why:** Existing salary calculations and stored package records use a single-role shape; preserving that shape prevents older records and consumers from breaking during the transition.

**How to apply:** Any package create/edit flow or salary calculation that reads role-specific rates must preserve this fallback and first-row synchronization until all legacy consumers and records are retired.
