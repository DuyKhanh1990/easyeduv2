---
name: BIDV shared-gateway forwarding
description: Security and routing rules for the common Easyeduv2 BIDV callback host.
---

`easyeduv2.easyedu.vn` is a test-only environment. Keep its callback routing, registry, and secret separate from production. In each environment, route a registered service ID to its owning center; self-routes use the local handler, remote routes forward to the center's handler. Never trust a plain `X-Gateway-Source` marker: authenticate internal forwards with a shared secret and timestamp, then still verify BIDV's checksum at the receiving center.

**Why:** The user confirmed Easyeduv2 is test-only. Its center database does not contain every center's virtual accounts, so a service ID mapped to the wrong center returns VA-not-found; an unauthenticated forward could weaken PAYBILL protections.

**How to apply:** Test with a test target and test secret first. Do not point production BIDV callbacks at Easyeduv2 or reuse its registry/secret in production. Keep each production callback on its designated shared production host, map service IDs to the right centers, and preserve strict public IP checks at that host.
