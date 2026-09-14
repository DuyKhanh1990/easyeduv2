---
name: Web Push tenant scope
description: Shared VAPID deployment and tenant isolation rules for browser push subscriptions
---

## Rule
All center deployments may share one stable VAPID key pair, but browser subscriptions must be stored and queried with the current center ID and authenticated user ID. Never accept either tenant identity from the browser payload.

**Why:** VAPID identifies the sending application, not a tenant or user. Tenant isolation comes from the backend/database context; without the center scope, a shared database could send or delete a subscription across centers.

**How to apply:** Keep VAPID keys in deployment secrets, derive center ID from the local `center_config` row, derive user ID from JWT/session, and apply the schema change to every center database before deploying the code that uses the new table.