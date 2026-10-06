---
name: Shared production and workspace database
description: Production and the Replit workspace share data, even when they run different code versions.
---

The production app and the Replit workspace use the same PostgreSQL database, but their application runtimes can run different code versions.

**Why:** The user confirmed the shared database during a production troubleshooting session; database parity did not imply that the live server had the workspace's latest code.

**How to apply:** When production and workspace show the same records but behave differently, verify which code version serves production before treating the database as separate or changing data.
