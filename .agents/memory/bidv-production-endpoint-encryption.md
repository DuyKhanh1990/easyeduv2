---
name: BIDV Production endpoint and encryption
description: Production BIDV endpoint path and safe encryption-key compatibility for provider settings.
---

BIDV Production uses the base path `/bidv/service`; `/bidvorg/service` is not the Production path supplied for the current OpenAPI credentials.

**Why:** The old path reached BIDV but returned HTTP 405 from the token endpoint, while a POST to the supplied path reached OAuth and returned a normal 401 for fake credentials.

**How to apply:** Keep the Production base URL aligned with the latest BIDV-issued links. Provider secrets are encrypted through the shared crypto service; prefer `AI_ENCRYPT_SECRET` for new writes and retain a legacy-key fallback during migration so existing encrypted rows can still be read when the old key is present.