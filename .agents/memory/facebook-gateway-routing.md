---
name: Facebook Gateway routing
description: Boundary between centralized Facebook Page routing and each center's local CRM data
---

Facebook Page routing belongs in the Gateway database, not in the tenant CRM's shared schema. The Gateway maps `pageId` to a registered `centerId`; the center resolves the current `centerUrl` from `center_registry`. A tenant's `locationId` is local data and must not be used as the cross-tenant routing key.

**Why:** Each customer has its own domain and database, while location IDs only have meaning inside that customer's database. Centralizing the Page route prevents webhook traffic from being delivered to the wrong tenant and lets center URL changes or deactivation take effect immediately.

**How to apply:** Future Facebook OAuth/webhook work must resolve and validate `centerId` in the Gateway first, then forward to the trusted center URL. Keep the existing tenant-side `facebook_page_configs` for local Page metadata, location assignment, encrypted token, and conversation data.