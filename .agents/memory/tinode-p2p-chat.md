---
name: Tinode P2P chat quirks
description: UID format, subscribe conventions, name resolution, and known auth gap for Tinode P2P/DM chat.
---

- UID format is `u\d*_xxx`; do not prefix with `usr` when subscribing to P2P topics.
- Name resolution needs `scheduleFetchNames` + `registerName` (see prior notes) to avoid stale/blank names.
- **Known gap:** the mobile DM-open endpoint (`POST /api/mobile/chat/p2p/open` in `server/routes/mobile-chat.routes.ts`) does not enforce the "student can only DM their own class teacher" rule that the web equivalent (`POST /api/chat/p2p/open` in `server/routes/chat.routes.ts`) does. Confirmed via code read on 2026-07-11; user explicitly declined an immediate fix (relies on mobile UI hiding the DM/search-user buttons for students) — tracked as a proposed follow-up task instead of a live bug. Re-check this endpoint before assuming mobile DM access is server-side restricted.
