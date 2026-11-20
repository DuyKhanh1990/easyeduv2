# EduManage — Tài liệu Mobile Chat API (Tinode)

> **Phiên bản tài liệu:** 2.0  
> **Cập nhật:** 2025-07  
> **Áp dụng cho:** App mobile (React Native / Flutter)

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Xác thực (Auth)](#2-xác-thực-auth)
3. [Luồng khởi động Chat](#3-luồng-khởi-động-chat)
4. [Danh sách API](#4-danh-sách-api)
   - [POST /connect — Lấy thông tin kết nối Tinode](#41-post-apimobilechatconnect)
   - [PUT /uid — Lưu Tinode UID](#42-put-apimobilechatuid)
   - [GET /permissions — Quyền chat](#43-get-apimobilechatpermissions)
   - [GET /groups — Danh sách nhóm & DM](#44-get-apimobilechatgroups)
   - [POST /groups — Tạo nhóm mới](#45-post-apimobilechatgroups)
   - [GET /groups/:groupId — Chi tiết nhóm](#46-get-apimobilechatgroupsgroupid)
   - [PUT /groups/:groupId — Đổi tên nhóm](#47-put-apimobilechatgroupsgroupid)
   - [DELETE /groups/:groupId — Xoá nhóm](#48-delete-apimobilechatgroupsgroupid)
   - [POST /groups/:groupId/members — Thêm thành viên](#49-post-apimobilechatgroupsgroupidmembers)
   - [DELETE /groups/:groupId/members/:uid — Xoá / Rời nhóm](#410-delete-apimobilechatgroupsgroupidmembersuid)
   - [POST /p2p/open — Mở chat 1-1 (DM)](#411-post-apimobilechatp2popen)
   - [GET /search-users — Tìm kiếm người dùng](#412-get-apimobilechatsearch-users)
   - [GET /users — Tra tên theo Tinode UID](#413-get-apimobilechatusers)
   - [GET /topics/:topicId/members — Thành viên theo topicId](#414-get-apimobilechattopicstopicidmembers)
   - [POST /topics/:topicId/members — Thêm thành viên qua topicId](#415-post-apimobilechattopicstopicidmembers)
   - [DELETE /topics/:topicId/members/:uid — Xoá thành viên qua topicId](#416-delete-apimobilechattopicstopicidmembersuid)
   - [GET /classes/search — Tìm lớp học (chỉ staff)](#417-get-apimobilechatclassessearch)
   - [GET /classes/:classId/members — Thành viên lớp học](#418-get-apimobilechatclassesclassidmembers)
   - [GET /classes/:classId/groups — Nhóm của lớp học](#419-get-apimobilechatclassesclassidgroups)
   - [GET /channels — Kênh lớp học (deprecated)](#420-get-apimobilechatchannels-deprecated)
5. [Push Notification](#5-push-notification)
6. [Quy tắc phân quyền](#6-quy-tắc-phân-quyền)
7. [Lưu ý quan trọng cho app mobile](#7-lưu-ý-quan-trọng-cho-app-mobile)
8. [Mã lỗi chuẩn](#8-mã-lỗi-chuẩn)

---

## 1. Tổng quan kiến trúc

```
App Mobile
    │
    ├─► EduManage Server API  (/api/mobile/chat/*)
    │       - Quản lý nhóm, DM, thành viên
    │       - Tra cứu credentials Tinode
    │       - Phân quyền, tìm kiếm user
    │
    └─► Tinode Server (WebSocket / gRPC)
            - Nhắn tin thời gian thực
            - Subscribe/publish tin nhắn
            - Upload file, hình ảnh
```

**Nguyên tắc hoạt động:**
- App gọi EduManage API để lấy credentials → tự kết nối WebSocket đến Tinode server.
- Tinode xử lý toàn bộ tin nhắn real-time (gửi/nhận/lưu trữ).
- EduManage API quản lý metadata (nhóm, thành viên, phân quyền) và gửi push notification.

**Loại topic Tinode được sử dụng:**
- Tất cả topic (nhóm + DM) đều là **group topic** (`grp*`).
- **Không dùng** Tinode native P2P topic (`usr*` / `p2p`).

---

## 2. Xác thực (Auth)

Tất cả API đều yêu cầu JWT Bearer token trong header:

```
Authorization: Bearer <jwt_token>
```

JWT được cấp từ flow đăng nhập EduManage (`POST /api/mobile/auth/login`).  
Token không hợp lệ hoặc hết hạn → HTTP `401`.

---

## 3. Luồng khởi động Chat

```
1. App đăng nhập EduManage → nhận JWT
        ↓
2. POST /api/mobile/chat/connect
   → Nhận: tinodeUrl, apiKey, login, password, tinodeUid
        ↓
3. App kết nối WebSocket đến tinodeUrl
   (dùng Tinode SDK với apiKey)
        ↓
4. Đăng nhập Tinode bằng login + password
   → Nhận Tinode UID (dạng "usrXXXXXX") từ server Tinode
        ↓
5. PUT /api/mobile/chat/uid  { tinodeUid: "usrXXXXXX" }
   → Đồng bộ UID lên hệ thống (cần cho push notification)
        ↓
6. GET /api/mobile/chat/permissions
   → Lấy quyền, lưu vào state app
        ↓
7. GET /api/mobile/chat/groups
   → Lấy danh sách nhóm + DM, mỗi item có topicId
        ↓
8. App subscribe các topicId vào Tinode SDK
   → Hiển thị danh sách chat
```

> **Lưu ý bước 4:** Nếu `tinodeUid` đã được trả về từ `/connect` (field `data.tinodeUid`),
> app có thể bỏ qua việc lấy UID từ Tinode và dùng trực tiếp giá trị đó.
> Nếu `tinodeUid = null`, app cần lấy từ Tinode SDK sau khi đăng nhập thành công, rồi gửi lên PUT /uid.

---

## 4. Danh sách API

> **Base URL:** `https://<server>/api/mobile/chat`  
> **Format response:** JSON, chuẩn `{ success: boolean, data?: ..., message?: string }`

---

### 4.1 POST /api/mobile/chat/connect

Lấy thông tin kết nối Tinode. **Gọi mỗi lần mở app / hết phiên.**

> Server sẽ tự tạo tài khoản Tinode cho user nếu chưa có (`ensureUserInTinode`).

**Request:**
```
POST /api/mobile/chat/connect
Authorization: Bearer <jwt>
```
*(Không có body)*

**Response 200:**
```json
{
  "success": true,
  "data": {
    "tinodeUrl": "wss://chattinode.example.com",
    "apiKey": "AQEAAAABAAD_rAp4DJh...",
    "login": "u_a1b2c3d4e5f6g7h8i9j0k1l2m3n4",
    "password": "3f8a2b1c4d5e6f7a",
    "displayName": "Nguyễn Văn A",
    "tinodeUid": "usr3abc1234xyz",
    "generatedAt": "2025-07-01T08:00:00.000Z"
  }
}
```

| Field | Kiểu | Mô tả |
|-------|------|-------|
| `tinodeUrl` | `string` | WebSocket URL của Tinode server |
| `apiKey` | `string` | API key để khởi tạo Tinode SDK |
| `login` | `string` | Tên đăng nhập Tinode (deterministic theo userId) |
| `password` | `string` | Mật khẩu Tinode (≤32 ký tự, deterministic, HMAC) |
| `displayName` | `string\|null` | Tên hiển thị trong app |
| `tinodeUid` | `string\|null` | Tinode UID (`usrXXX`). Null nếu user chưa từng đăng nhập Tinode |
| `generatedAt` | `ISO 8601` | Thời điểm tạo response |

**Response 503:** Chat chưa được cấu hình trên server.

---

### 4.2 PUT /api/mobile/chat/uid

Lưu Tinode UID sau khi app đăng nhập thành công vào Tinode SDK.  
**Bắt buộc gọi** nếu `tinodeUid` trong `/connect` là `null`.

**Request:**
```
PUT /api/mobile/chat/uid
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "tinodeUid": "usrXXXXXXXXXX"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `tinodeUid` | ✅ | Phải bắt đầu bằng `"usr"` |

**Response 200:**
```json
{
  "success": true,
  "message": "Đã lưu Tinode UID thành công.",
  "updatedAt": "2025-07-01T08:00:00.000Z"
}
```

**Response 400:** `tinodeUid` không hợp lệ (không bắt đầu bằng `"usr"`).

---

### 4.3 GET /api/mobile/chat/permissions

Lấy quyền chat chi tiết. **Gọi 1 lần khi khởi động**, lưu vào local state.

**Request:**
```
GET /api/mobile/chat/permissions
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "permissions": {
      "canCreateGroup":  true,
      "canAddMember":    true,
      "canRemoveMember": false,
      "canOpenDM":       true
    }
  }
}
```

| Field | Mô tả |
|-------|-------|
| `canCreateGroup` | Tạo nhóm chat mới. Luôn `false` với học sinh |
| `canAddMember` | Thêm thành viên vào nhóm (theo quyền "Tạo" trên /chat) |
| `canRemoveMember` | Xoá thành viên khỏi nhóm (theo quyền "Xoá" trên /chat) |
| `canOpenDM` | Mở chat 1-1. Học sinh chỉ được DM giáo viên của mình (server enforce per-request) |

> **Per-group override:** Người tạo nhóm (`isCreator = true` trong GET /groups) luôn có quyền thêm/xoá thành viên trong nhóm đó, bất kể `canAddMember`/`canRemoveMember`.  
> → App nên hiển thị nút thêm/xoá nếu: `canAddMember || isCreator` / `canRemoveMember || isCreator`

---

### 4.4 GET /api/mobile/chat/groups

Danh sách **tất cả nhóm + DM** của user. Dùng để render tab "Nhóm / Tin nhắn".

**Request:**
```
GET /api/mobile/chat/groups
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "topicId":     "grpOwOiDiLPlCQ",
        "name":        "Nhóm Lớp Toán K1",
        "memberCount": 15,
        "isCreator":   true,
        "createdAt":   "2025-06-01T07:00:00.000Z"
      },
      {
        "topicId":     "grpAbCdEfGhIjKl",
        "name":        "Nguyễn Thị B",
        "memberCount": 2,
        "isCreator":   false,
        "createdAt":   "2025-06-15T09:30:00.000Z"
      }
    ],
    "total": 2,
    "permissions": {
      "canCreateGroup":  true,
      "canAddMember":    true,
      "canRemoveMember": false,
      "canOpenDM":       true
    }
  }
}
```

| Field | Mô tả |
|-------|-------|
| `topicId` | ID topic Tinode (`grp*`). Dùng để subscribe Tinode SDK |
| `name` | Tên nhóm; với DM = tên hiển thị của người kia (đã được server resolve) |
| `memberCount` | Số thành viên |
| `isCreator` | User hiện tại có phải người tạo không (dùng cho quyền per-group) |
| `permissions` | Quyền chat (tương đương `/permissions`, trả kèm để giảm request) |

> **DM trong danh sách này:** `name` đã được server tính sẵn là tên người kia, app dùng trực tiếp để hiển thị.

---

### 4.5 POST /api/mobile/chat/groups

Tạo nhóm chat tùy chỉnh mới. **Chỉ staff/admin**, học sinh nhận `403`.

**Request:**
```
POST /api/mobile/chat/groups
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "Nhóm học tập Lớp Anh K2",
  "memberUserIds": ["uuid-user-1", "uuid-user-2"],
  "classId": "uuid-lop-hoc"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `name` | ✅ | Tên nhóm, không được trống |
| `memberUserIds` | ❌ | Danh sách userId thêm vào (không cần gồm userId của mình) |
| `classId` | ❌ | Nếu có → server tự thêm toàn bộ GV + phụ trách + học viên active của lớp vào nhóm |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "group": {
      "id":        "550e8400-e29b-41d4-a716-446655440000",
      "name":      "Nhóm học tập Lớp Anh K2",
      "topicId":   "grpXXXXXXXXXXXX",
      "createdBy": "uuid-user-creator",
      "classId":   "uuid-lop-hoc",
      "createdAt": "2025-07-01T08:00:00.000Z"
    }
  }
}
```

> **Lưu ý:** `topicId` có thể là `null` nếu Tinode server tạm thời không phản hồi. Nhóm vẫn được tạo trong DB. App nên retry sau hoặc báo lỗi nhẹ.

**Response 403:** Học sinh hoặc phụ huynh không được tạo nhóm.

---

### 4.6 GET /api/mobile/chat/groups/:groupId

Chi tiết nhóm + danh sách thành viên.

**Request:**
```
GET /api/mobile/chat/groups/:groupId
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "group": {
      "id":          "550e8400-e29b-41d4-a716-446655440000",
      "name":        "Nhóm học tập Lớp Anh K2",
      "topicId":     "grpXXXXXXXXXXXX",
      "createdBy":   "uuid-creator",
      "isCreator":   true,
      "memberCount": 5,
      "createdAt":   "2025-07-01T08:00:00.000Z"
    },
    "members": [
      { "userId": "uuid-1", "displayName": "Nguyễn Văn A", "role": "staff" },
      { "userId": "uuid-2", "displayName": "Trần Thị B",   "role": "student" }
    ]
  }
}
```

**Response 403:** Không phải thành viên nhóm.  
**Response 404:** Không tìm thấy nhóm.

---

### 4.7 PUT /api/mobile/chat/groups/:groupId

Đổi tên nhóm. **Chỉ người tạo nhóm.**

**Request:**
```
PUT /api/mobile/chat/groups/:groupId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "Tên mới" }
```

**Response 200:**
```json
{ "success": true }
```

**Response 403:** Không phải người tạo.  
**Response 404:** Không tìm thấy nhóm.

---

### 4.8 DELETE /api/mobile/chat/groups/:groupId

Xoá nhóm. **Chỉ người tạo nhóm.**  
Topic Tinode tương ứng cũng bị hard-delete.

**Request:**
```
DELETE /api/mobile/chat/groups/:groupId
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{ "success": true, "message": "Đã xoá nhóm." }
```

**Response 403:** Không phải người tạo.  
**Response 404:** Không tìm thấy nhóm.

---

### 4.9 POST /api/mobile/chat/groups/:groupId/members

Thêm thành viên vào nhóm (theo groupId).

**Quyền:** `isSuperAdmin` **HOẶC** người tạo nhóm **HOẶC** staff có quyền "Tạo" trên `/chat`.

**Request:**
```
POST /api/mobile/chat/groups/:groupId/members
Authorization: Bearer <jwt>
Content-Type: application/json

{ "memberUserId": "uuid-user-can-them" }
```

**Response 200:**
```json
{ "success": true }
```

**Response 400:** DM group không cho thêm thành viên.  
**Response 403:** Không có quyền.  
**Response 404:** Không tìm thấy nhóm.  
**Response 409:** Thành viên đã có trong nhóm.

---

### 4.10 DELETE /api/mobile/chat/groups/:groupId/members/:uid

Xoá thành viên hoặc tự rời nhóm.

- Truyền `uid` = userId của người cần xoá.
- Truyền `uid` = `"me"` để tự rời nhóm.
- Người tạo nhóm **không thể** tự rời nhóm (phải xoá nhóm).

**Request:**
```
DELETE /api/mobile/chat/groups/:groupId/members/:uid
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{ "success": true }
```

**Response 400:** Người tạo không thể rời nhóm.  
**Response 403:** Không có quyền xoá người khác.  
**Response 404:** Không tìm thấy nhóm / thành viên.

---

### 4.11 POST /api/mobile/chat/p2p/open

Mở / chuẩn bị chat 1-1 (DM) với người khác.  
Server tạo hoặc tái sử dụng group topic (`grp*`) dạng DM.

> **Học sinh:** Chỉ được mở DM với giáo viên trong lớp đang học. Server sẽ trả `403` nếu vi phạm.

**Request:**
```
POST /api/mobile/chat/p2p/open
Authorization: Bearer <jwt>
Content-Type: application/json

{ "targetUserId": "uuid-cua-user-kia" }
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `targetUserId` | ✅ | UUID của người muốn chat (không được là chính mình) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "topicId": "grpAbCdEfGhIjKl",
    "groupId": "550e8400-e29b-41d4-a716-446655440000",
    "isNew":   true,
    "name":    "Nguyễn Thị B"
  }
}
```

| Field | Mô tả |
|-------|-------|
| `topicId` | Tinode topic ID (`grp*`) — dùng để subscribe Tinode SDK |
| `groupId` | UUID trong DB (dùng cho các API group khác) |
| `isNew` | `true` nếu vừa tạo mới, `false` nếu đã tồn tại |
| `name` | **Tên hiển thị thật của người kia** — app **phải** dùng field này làm tiêu đề màn hình chat |

> ⚠️ **Quan trọng:** App **KHÔNG** được dùng `topic.public.fn` từ Tinode SDK làm tiêu đề màn hình DM.  
> Lý do: `fn` trên Tinode set theo góc nhìn người tạo, không phân biệt theo người xem → sẽ sai ở một đầu.  
> Luôn dùng field `name` từ API này.

**Response 400:** `targetUserId` không hợp lệ hoặc cố chat với chính mình.  
**Response 403:** Học sinh cố DM người không phải giáo viên của mình.  
**Response 404:** Không tìm thấy `targetUserId`.  
**Response 503:** Tinode chưa được cấu hình.

---

### 4.12 GET /api/mobile/chat/search-users

Tìm kiếm user để mở DM hoặc thêm vào nhóm.

- **Học sinh:** Chỉ tìm được giáo viên trong lớp đang học.
- **Staff/Admin:** Tìm toàn bộ staff và học sinh.

**Request:**
```
GET /api/mobile/chat/search-users?q=nguyen
Authorization: Bearer <jwt>
```

| Query param | Bắt buộc | Mô tả |
|-------------|----------|-------|
| `q` | ✅ | Từ khoá tìm kiếm (tối thiểu 1 ký tự). Trống → trả `[]` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId":      "uuid-user",
        "displayName": "Nguyễn Văn A",
        "role":        "staff",
        "tinodeLogin": "u_a1b2c3d4e5f6g7h8i9j0k1l2m3n4",
        "tinodeUid":   "usr3abc1234xyz"
      },
      {
        "userId":      "uuid-student",
        "displayName": "Nguyễn Thị B",
        "role":        "student",
        "tinodeLogin": "u_b2c3d4e5f6g7h8i9j0k1l2m3n4o5",
        "tinodeUid":   null
      }
    ]
  }
}
```

| Field | Mô tả |
|-------|-------|
| `userId` | UUID hệ thống — dùng khi gọi `POST /p2p/open` hoặc thêm vào nhóm |
| `role` | `"staff"` hoặc `"student"` |
| `tinodeLogin` | Tinode login (deterministic) — có thể dùng để kết nối P2P trực tiếp qua Tinode SDK nếu cần |
| `tinodeUid` | Tinode UID (`usrXXX`). `null` nếu user chưa từng đăng nhập chat |

---

### 4.13 GET /api/mobile/chat/users

Tra tên hiển thị theo danh sách Tinode UID. Dùng để resolve tên người dùng khi hiển thị tin nhắn.

**Request:**
```
GET /api/mobile/chat/users?uids=usrAAA,usrBBB,usrCCC
Authorization: Bearer <jwt>
```

| Query param | Bắt buộc | Mô tả |
|-------------|----------|-------|
| `uids` | ✅ | Danh sách Tinode UID, phân cách bằng dấu phẩy. Tối đa **50 UID** mỗi request |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      { "tinodeUid": "usrAAA", "displayName": "Nguyễn Văn A" },
      { "tinodeUid": "usrBBB", "displayName": "Trần Thị B" }
    ],
    "fetchedAt": "2025-07-01T08:00:00.000Z"
  }
}
```

> UID không tìm thấy trong DB sẽ bị bỏ qua khỏi danh sách trả về.

**Response 400:** `uids` không hợp lệ hoặc vượt quá 50.

---

### 4.14 GET /api/mobile/chat/topics/:topicId/members

Lấy thành viên của một topic theo Tinode topicId. Hoạt động với cả custom group lẫn class-based topic.

**Request:**
```
GET /api/mobile/chat/topics/grpOwOiDiLPlCQ/members
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "members": [
      { "userId": "uuid-1", "displayName": "Nguyễn Văn A", "role": "staff" },
      { "userId": "uuid-2", "displayName": "Trần Thị B",   "role": "student" }
    ]
  }
}
```

**Response 404:** Topic không tồn tại trong hệ thống.

---

### 4.15 POST /api/mobile/chat/topics/:topicId/members

Thêm thành viên vào custom group theo Tinode topicId.  
**Không áp dụng cho DM.**

**Quyền:** `isSuperAdmin` HOẶC người tạo nhóm HOẶC staff có quyền "Tạo" `/chat`.

**Request:**
```
POST /api/mobile/chat/topics/grpOwOiDiLPlCQ/members
Authorization: Bearer <jwt>
Content-Type: application/json

{ "memberUserId": "uuid-user-can-them" }
```

**Response 200:**
```json
{ "success": true }
```

**Response 400:** DM không cho thêm thành viên.  
**Response 403:** Không có quyền.  
**Response 404:** Không tìm thấy nhóm.  
**Response 409:** Thành viên đã có trong nhóm.

---

### 4.16 DELETE /api/mobile/chat/topics/:topicId/members/:uid

Xoá thành viên / tự rời nhóm theo Tinode topicId.

- `uid` = userId thực của thành viên cần xoá.
- `uid` = `"me"` để tự rời nhóm.

**Request:**
```
DELETE /api/mobile/chat/topics/grpOwOiDiLPlCQ/members/uuid-user-can-xoa
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{ "success": true }
```

**Response 400:** Người tạo không thể rời nhóm (phải xoá nhóm).  
**Response 403:** Không có quyền.  
**Response 404:** Không tìm thấy nhóm / thành viên.

---

### 4.17 GET /api/mobile/chat/classes/search

Tìm kiếm lớp học để điền vào form tạo nhóm. **Chỉ staff**, học sinh nhận danh sách rỗng.

**Request:**
```
GET /api/mobile/chat/classes/search?q=toan
Authorization: Bearer <jwt>
```

| Query param | Bắt buộc | Mô tả |
|-------------|----------|-------|
| `q` | ❌ | Từ khoá (tên hoặc mã lớp). Để trống → trả 20 lớp gần nhất |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "classes": [
      { "id": "uuid-lop", "name": "Lớp Toán K1", "classCode": "TOAN-K1-2025" }
    ]
  }
}
```

> Staff chỉ thấy lớp mà họ là giáo viên, quản lý, hoặc thuộc cơ sở được phân công.  
> SuperAdmin thấy toàn bộ.

---

### 4.18 GET /api/mobile/chat/classes/:classId/members

Lấy thành viên lớp học (giáo viên + phụ trách + học viên active). Dùng để auto-fill form tạo nhóm.

**Request:**
```
GET /api/mobile/chat/classes/:classId/members
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "members": [
      { "userId": "uuid-1", "displayName": "Nguyễn Văn A", "role": "staff" },
      { "userId": "uuid-2", "displayName": "Trần Thị B",   "role": "student" }
    ]
  }
}
```

**Response 403:** Không có quyền xem lớp này.  
**Response 404:** Không tìm thấy lớp.

---

### 4.19 GET /api/mobile/chat/classes/:classId/groups

Lấy danh sách nhóm chat đã được tạo từ lớp học. Dùng để hiển thị cảnh báo trong form tạo nhóm ("Lớp này đã có nhóm: X, Y").

**Request:**
```
GET /api/mobile/chat/classes/:classId/groups
Authorization: Bearer <jwt>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "groups": [
      { "id": "uuid-group", "name": "Nhóm Lớp Toán K1" }
    ]
  }
}
```

---

### 4.20 GET /api/mobile/chat/channels *(deprecated)*

> ⛔ **Đã bị tắt.** API này không còn trả dữ liệu.  
> Kênh chat tự động theo lớp học đã bị loại bỏ. Dùng `GET /groups` thay thế.

**Response 200:** Luôn trả `{ "data": { "channels": [], "total": 0 } }`

---

## 5. Push Notification

### 5.1 Cấu trúc payload

Khi có tin nhắn mới, server gửi Expo Push Notification đến thiết bị của tất cả thành viên (trừ người gửi):

```json
{
  "title": "💬 Nguyễn Văn A",
  "body":  "Hẹn gặp buổi tối nhé",
  "data": {
    "type":          "chat",
    "referenceId":   "grpOwOiDiLPlCQ",
    "referenceType": "dm_chat"
  }
}
```

| Field | Giá trị có thể |
|-------|---------------|
| `data.type` | `"chat"` |
| `data.referenceId` | Tinode topic ID (`grpXXX`) |
| `data.referenceType` | `"dm_chat"` (chat 1-1) hoặc `"group_chat"` (nhóm) |

### 5.2 Tiêu đề thông báo

| Loại | `title` | `body` |
|------|---------|--------|
| DM (1-1) | `💬 <Tên người gửi>` | Nội dung tin nhắn |
| Nhóm | `💬 <Tên nhóm>` | `<Tên người gửi>: Nội dung` |

### 5.3 Loại nội dung

Server tự nhận diện và hiển thị emoji phù hợp:

| Loại file | Body thông báo |
|-----------|----------------|
| Hình ảnh | `🖼 <tên file>` |
| Tin nhắn thoại | `🎤 Tin nhắn thoại` |
| Video | `🎥 <tên file>` |
| File đính kèm | `📎 <tên file>` |
| Text | Nội dung (tối đa 100 ký tự) |

### 5.4 Xử lý deeplink

Khi user nhấn vào thông báo, app nhận `data.referenceId` = Tinode topicId → navigate đến màn hình chat với topicId đó.

```
data.type === "chat"
  → navigate("Chat", { topicId: data.referenceId })
```

> **Lưu ý:** `referenceId` trong push notification là **Tinode topicId** (`grp*`), không phải groupId trong DB.

### 5.5 Thông báo trong app (chuông)

Ngoài push, server cũng ghi vào bảng `notifications` (chuông thông báo trong app) với:
- `category`: `"chat"`
- `deeplink.screen`: `"Chat"`
- `deeplink.params.topicId`: Tinode topicId

---

## 6. Quy tắc phân quyền

### Theo role

| Hành động | SuperAdmin | Staff | Học sinh |
|-----------|:----------:|:-----:|:--------:|
| Tạo nhóm | ✅ | ✅ | ❌ |
| Thêm thành viên | ✅ | Theo quyền `/chat` | ❌ |
| Xoá thành viên | ✅ | Theo quyền `/chat` | ❌ |
| Mở DM | ✅ | ✅ (bất kỳ ai) | ✅ (chỉ GV của lớp) |
| Xoá nhóm | ✅ | Người tạo | ❌ |
| Đổi tên nhóm | ✅ | Người tạo | ❌ |

### Per-group: Override cho người tạo nhóm

Người tạo nhóm (`isCreator = true`) **luôn có quyền** thêm/xoá thành viên trong nhóm đó, dù `canAddMember`/`canRemoveMember` từ `/permissions` là `false`.

### Học sinh — hạn chế DM

- Server enforce tại `POST /p2p/open`: học sinh chỉ được mở DM với staff là giáo viên của lớp đang học.
- `GET /search-users` cũng chỉ trả giáo viên trong lớp của học sinh.

---

## 7. Lưu ý quan trọng cho app mobile

### 7.1 Tên hiển thị trong chat DM

> ⚠️ **KHÔNG dùng** `topic.public.fn` từ Tinode SDK làm tiêu đề màn hình DM.

- `fn` trên Tinode được set theo tên người kia từ góc nhìn người tạo.
- Trong DM, người tạo và người nhận sẽ thấy **cùng một `fn`** — gây sai lệch ở một chiều.
- **Luôn dùng** field `name` trả về từ `POST /p2p/open` hoặc field `name` trong `GET /groups`.

### 7.2 Credentials Tinode

- `login` và `password` được tạo **deterministic** từ userId + secret server.
- **Không lưu** credentials vào storage lâu dài — luôn gọi lại `/connect` để lấy mới nếu phiên hết hạn.
- `password` tối đa **32 ký tự** (giới hạn Tinode).

### 7.3 topicId vs groupId

| Field | Dùng cho |
|-------|----------|
| `topicId` (`grp*`) | Kết nối Tinode SDK (subscribe, publish, get messages) |
| `groupId` (UUID) | Gọi các API EduManage (thêm/xoá thành viên, đổi tên, xoá nhóm) |

### 7.4 Tránh duplicate push khi bot reconnect

Server có cơ chế chống duplicate: bỏ qua tin nhắn cũ hơn **30 giây** và tin đã xử lý (theo `seq`). App không cần xử lý thêm ở phía client.

### 7.5 Stale topic recovery

Khi gọi `POST /p2p/open`, nếu topic Tinode cũ đã bị xoá khỏi MongoDB (ví dụ sau khi reset dữ liệu), server tự tạo lại topic mới và cập nhật `topicId`. App nhận `topicId` mới, không cần làm gì thêm.

### 7.6 Kênh lớp học tự động (đã bỏ)

Tính năng tạo kênh Tinode tự động theo lớp học đã bị **tắt hoàn toàn**. App không nên hiển thị hay gọi các API liên quan (`/channels`, `/channel/:classId`).

---

## 8. Mã lỗi chuẩn

| HTTP Code | Ý nghĩa |
|-----------|---------|
| `200` | Thành công |
| `400` | Dữ liệu đầu vào không hợp lệ |
| `401` | Chưa đăng nhập hoặc JWT hết hạn |
| `403` | Không có quyền thực hiện hành động |
| `404` | Không tìm thấy tài nguyên |
| `409` | Xung đột (ví dụ: thành viên đã tồn tại) |
| `410` | Tính năng không còn được hỗ trợ |
| `500` | Lỗi server |
| `503` | Tinode chưa được cấu hình |

**Cấu trúc response lỗi:**
```json
{
  "success": false,
  "message": "Mô tả lỗi cụ thể bằng tiếng Việt"
}
```

---

*Tài liệu này được sinh từ source code thực tế của `server/routes/mobile-chat.routes.ts` và `server/services/tinode-push.service.ts`.*
