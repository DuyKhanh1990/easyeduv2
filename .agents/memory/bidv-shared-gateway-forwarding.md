---
name: BIDV shared-gateway forwarding
description: Security and routing rules for the common Easyeduv2 BIDV callback host.
---

Easyeduv2 remains both a normal center and the shared BIDV callback receiver. Route each registered service ID to its owning center; self-routes use the local handler, remote routes forward to the center's handler. Never trust a plain `X-Gateway-Source` marker: authenticate internal forwards with a shared secret and timestamp, then still verify BIDV's checksum at the receiving center.

**Why:** The same domain can receive all callbacks, but its center database does not contain every center's virtual accounts. A service ID mapped to the wrong center returns VA-not-found; an unauthenticated forward bypass could weaken PAYBILL protections.

**How to apply:** Keep BIDV's callback URLs unchanged. Ensure the gateway registry maps each service ID to the right center, deploy the same internal secret to gateway and target, and preserve strict public IP checks at the shared receiver.
