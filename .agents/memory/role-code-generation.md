---
name: Role-based account code generation
description: How automatic codes behave when a new customer or staff member has multiple assignments.
---

Automatic code generation uses the first selected role and first selected location as the single code stem. A user still receives one globally unique code even when their assignments span multiple locations or roles; manual codes remain untouched.

**Why:** The account tables store one code per user, while staff assignments can be a location × role cross-product and customers can belong to multiple locations.

**How to apply:** Keep automatic allocation server-side and transaction-scoped. Use the configured role prefix, append the selected location code only when location scoping is enabled, and preserve manual codes and all existing user codes.