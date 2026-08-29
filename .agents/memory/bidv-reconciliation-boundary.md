---
name: BIDV reconciliation boundary
description: Reconciliation must be an additive read-only finance surface until the bank flow and reconciliation samples are formally validated.
---

The existing BIDV getbill/paybill routes, checksum behavior, invoice settlement side effects, and provider settings are a protected boundary. New reconciliation work should read existing transaction, virtual-account, and invoice data through separate services/routes and must not alter those flows.

**Why:** The user explicitly confirmed that the current BIDV connection and payment flow are stable and must not be changed while reconciliation is introduced.

**How to apply:** Start with a read-only Finance reconciliation page and internal matching/reporting. Keep real BIDV reconciliation calls, discrepancy submission, refunds, and debt collection behind a separate reviewed implementation with explicit approval.