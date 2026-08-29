---
name: Chat push notification UUID bug
description: Why chat push notifications failed silently after the referenceId was changed from UUID to Tinode topic string
---

# Chat Push Notification UUID Bug

## The Rule
`notifications.reference_id` is a `UUID` column in PostgreSQL. Never pass a Tinode topic string (e.g. `grpXXX`) as `referenceId` to `sendNotification`. Always pass the `chat_groups.id` or `classes.id` UUID.

## Why
The old code did `referenceId: topic` (passing the Tinode topic string like `"grppexz5zzbak8"`). PostgreSQL rejected the INSERT with a type error. `handleDataPacket` uses `Promise.allSettled` so the error was silently swallowed — no log, no notification in DB, no push sent. This caused 7 days of lost chat notifications.

## How to apply
- In `tinode-push.service.ts`, `handleDataPacket` must call `resolveTopicMeta(topic)` which returns both `kind` AND `referenceUuid` (the actual chat_groups.id or classes.id UUID).
- Pass `referenceId: referenceUuid ?? undefined` to `sendNotification`, never the raw Tinode topic ID.
- Cache is `topicMetaCache` (was `topicKindCache` before the fix).
- `subscribeBotToTopic` must clear `topicMetaCache`, not `topicKindCache`.

## Detection pattern
If chat notifications stop appearing in DB and there are no error logs → check if referenceId is being passed as a UUID. If `Promise.allSettled` wraps the DB insert, errors disappear silently.
