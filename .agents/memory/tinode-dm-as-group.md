---
name: Tinode DM-as-group pattern
description: Chat 1-1 dùng grp* topic thay vì native Tinode P2P; pattern cho p2p/open endpoint và frontend.
---

# Tinode DM-as-group pattern

Chat 1-1 không dùng native Tinode P2P (usr* topic) nữa. Thay vào đó dùng grp* group topic được lưu trong bảng `chat_groups` với `is_direct_message = TRUE`.

## Rule

- `POST /api/chat/p2p/open` (web) và `POST /api/mobile/chat/p2p/open` đều trả `{ topicId: "grpXXX", groupId, isNew }` — **không còn** `tinodeUid/tinodeLogin`.
- Frontend subscribe bằng `topicId` (grp*), không phải tinodeUid.
- `GET /api/chat/my-channels` trả DM topics cùng với class/group channels (field `isDirectMessage: true`, `className` = tên người kia).
- `allowedGroupTopicsRef` trong use-tinode.tsx tự động whitelist DM topics vì chúng có `topicId.startsWith("grp")`.
- UI (ChatPage + ChatButton) là flat list — không còn tab "Nhóm"/"Cá nhân".

**Why:** Native P2P `with` field không hoạt động với Tinode me-topic discovery sau app restart; grp* topic được load qua `/api/chat/my-channels` nên vẫn thấy sau khi restart.

## Authorization rule (p2p/open)

- Học viên (`isStudent = true`): chỉ được DM giáo viên (`teacherIds`) của các lớp mình đang học. Backend enforce, không phụ thuộc UI.
- Staff/Admin: có thể DM bất kỳ ai.

## Race condition prevention

Dùng `pg_advisory_xact_lock(hashtext(dmKey))` trong transaction để ngăn tạo duplicate DM group khi 2 user cùng gọi p2p/open đồng thời. `dmKey = dm_${[userId, targetUserId].sort().join("_")}`.

## Stale topic recovery

Khi trả existing DM, gọi `verifyAndSetTopicDefacs(topicId)`. Nếu stale (topic không còn trong Tinode): tạo lại grp* topic mới, cập nhật `chat_groups.tinode_topic_id`.
