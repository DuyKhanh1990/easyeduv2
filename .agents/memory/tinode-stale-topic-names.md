---
name: Tinode stale topic & name resolution
description: How to handle stale Tinode topic IDs after MongoDB wipe, and why user names appear as IDs in group chat.
---

# Tinode stale group topic + name resolution quirks

## Stale topic IDs after MongoDB wipe

**Rule:** After Tinode MongoDB is wiped, all `grp*` topic IDs stored in PostgreSQL `classes.tinode_topic_id` become stale. Subscribing to them returns Tinode ctrl 404/403.

**Why:** The backend's `verifyAndSetTopicDefacs` already detects this and recreates topics via `/api/chat/my-channels`. But the FRONTEND must also handle the 4xx ctrl on the sub request — previously it failed silently, so users could never send messages in class chats.

**How to apply:**
- Track sub IDs for grp* topics in `pendingGroupSubsByIdRef` (subId → topicId)
- On ctrl 4xx for a tracked sub: remove stale topic from sidebar, call `/api/chat/my-channels` (backend recreates and returns new ID), re-subscribe to the new topic
- Track pub IDs with content in `pendingPubsByIdRef` for retry; on ctrl 4xx: re-subscribe then retry once (max 2 attempts, only for 4xx not 5xx)

## Names showing as Tinode IDs (e.g. "GqL1y5Dk")

**Rule:** `scheduleFetchNames` used to mark UIDs as "known" even when the API returned null (no name found). This prevented any future retry — names stayed as IDs permanently until page reload.

**Why:** When MongoDB is wiped, users get new Tinode UIDs. `my-uid` updates DB when user opens chat. But if user A sends a message BEFORE user B's client has fetched their name, the null result is cached and never retried.

**Fix applied:**
1. Client: Only add UID to `knownUidsRef` when name is actually found. For unresolved UIDs, throttle retries to min 60s apart via `uidLastAttemptRef`.
2. Server: In `PUT /api/chat/my-uid`, call `userNameCache.delete(tinodeUid)` to evict the null server-side cache so other users can immediately resolve the name after registration.
