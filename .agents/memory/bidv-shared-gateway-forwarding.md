---
name: BIDV shared-gateway forwarding
description: Security and routing rules for the common Easyeduv2 BIDV callback host.
---

`easyeduv2.easyedu.vn` is a test-only environment and the shared BIDV callback endpoint, separate from each center's BIDV settings. Keep its callback routing, registry, and secret separate from production. Center-specific settings belong to the owning center; route each registered service ID to that center. Self-routes use the local handler, remote routes forward to the center's handler. Never trust a plain `X-Gateway-Source` marker: authenticate internal forwards with a shared secret and timestamp, then still verify BIDV's checksum at the receiving center.

**Why:** The user confirmed Easyeduv2 is test-only. Its center database does not contain every center's virtual accounts, so a service ID mapped to the wrong center returns VA-not-found; an unauthenticated forward could weaken PAYBILL protections.

**How to apply:** Enter center-specific BIDV settings at the owning center, but keep BIDV's callback URL on the designated shared host. Test with a test target and test secret first. Do not reuse the test registry/secret in production. Map service IDs to the right centers and preserve strict public IP checks at the shared receiver.
