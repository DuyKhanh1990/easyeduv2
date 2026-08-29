---
name: Tinode bot subscription 403 fix
description: Why bot gets 403 on subscribeToTopic and how to fix it
---

# Tinode Bot Subscription 403 Fix

## The Rule
Never include `set: { sub: { mode: "..." } }` in the bot's own subscribeToTopic call unless the mode is exactly within the topic defacs limits.

## Why
Topics are created with `defacs: { auth: "JRWP" }`. Requesting mode `"JRWPS"` (includes S = share) exceeds defacs auth. Tinode rejects the entire sub request with 403 instead of capping the mode. Old code ignored ctrl codes so the bot "succeeded" silently but never received data packets → chat push notifications dead for days.

## How to apply
- `subscribeToTopic` must NOT include `set.sub.mode`; use only `get: { what: "sub" }` for re-subscription.
- Always log the ctrl response code from subscribeToTopic to catch future 403s early.
- If all topics return 403 despite correct mode → bot UID changed (see tinode-stale-topic-names.md).
