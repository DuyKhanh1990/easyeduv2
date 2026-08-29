# Mobile API — Thông báo chuông (Học viên / Phụ huynh)

> **Dùng đúng endpoint:** App mobile học viên dùng `/api/mobile/student/notifications*`  
> *(KHÔNG dùng `/api/notifications` — endpoint đó là cho web admin)*

**Base URL:** `https://<domain>`  
**Auth:** `Authorization: Bearer <JWT>`  
**Content-Type:** `application/json`

---

## Các endpoint

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/mobile/student/notifications` | Danh sách thông báo (có deeplink) |
| GET | `/api/mobile/student/notifications/unread-count` | Số badge chưa đọc |
| PATCH | `/api/mobile/student/notifications/:id/read` | Đánh dấu 1 thông báo đã đọc |
| PATCH | `/api/mobile/student/notifications/read-all` | Đánh dấu tất cả đã đọc |

---

## 1. Danh sách thông báo

```
GET /api/mobile/student/notifications?limit=50&offset=0
```

- **Học viên** → trả thông báo của chính mình  
- **Phụ huynh** → gộp thông báo của **tất cả con em** liên kết, kèm field `student` để biết noti thuộc con nào

**Query params:**

| Param | Mặc định | Tối đa |
|---|---|---|
| `limit` | 50 | 100 |
| `offset` | 0 | — |

**Response 200:**
```json
{
  "totalUnread": 3,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "title": "Thông báo điểm danh",
      "content": "Giáo viên Nguyễn Thị B vừa Điểm danh: Có học, Lớp Toán 10A, Buổi 5, Thứ 2 30/06/2026 08:00-09:30",
      "type": "in-app",
      "category": "attendance",
      "referenceId": "uuid-lớp",
      "referenceType": "class",
      "isRead": false,
      "createdAt": "2026-06-30T08:15:00.000Z",
      "deeplink": {
        "screen": "Calendar",
        "params": {
          "date": "2026-06-30",
          "sessionId": "uuid-buổi-học",
          "classId": "uuid-lớp"
        }
      },
      "student": null
    }
  ]
}
```

> **`deeplink` đã được server tính sẵn** — app chỉ cần đọc `deeplink.screen` và `deeplink.params` rồi navigate, không cần tự parse.  
> Với **phụ huynh**: field `student` = `{ id, fullName, code }` để hiển thị "noti của con nào". Với học viên: `student = null`.

---

## 2. Số badge chưa đọc

```
GET /api/mobile/student/notifications/unread-count
```

**Response — Học viên:**
```json
{ "total": 5 }
```

**Response — Phụ huynh:**
```json
{
  "total": 8,
  "byStudent": [
    { "studentId": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001", "unread": 5 },
    { "studentId": "uuid", "fullName": "Nguyễn Thị B", "code": "HV002", "unread": 3 }
  ]
}
```

---

## 3. Đánh dấu đã đọc — 1 thông báo

```
PATCH /api/mobile/student/notifications/:id/read
```

Gọi **ngay khi user click** vào notification (trước khi navigate).

**Response 200:**
```json
{ "success": true }
```

**Response 404:** nếu noti không tồn tại hoặc không thuộc user này.

---

## 4. Đánh dấu đã đọc — Tất cả

```
PATCH /api/mobile/student/notifications/read-all
```

**Response 200:**
```json
{ "success": true }
```

---

## 5. Screen Routing — Bảng đầy đủ

> **Cột `deeplink` được tính sẵn tại thời điểm tạo notification** và lưu thẳng vào DB.
> Endpoint `/api/mobile/student/notifications` trả **thẳng** `n.deeplink` khi cột này có giá trị.
> Bảng 5A/5B dưới đây **chỉ còn là fallback** cho các notification cũ (tạo trước khi có cột `deeplink`) — server tự động suy luận lại theo logic cũ cho các dòng đó.

### 5A. Logic resolve screen (fallback — chỉ áp dụng khi `deeplink` là `null`)

| Điều kiện | `screen` | `params` |
|---|---|---|
| title/content chứa "bảng điểm" **HOẶC** `referenceType` = `"score_sheet"` / `"grade_book"` | `"ScoreSheet"` | `{}` |
| `category` = `"finance"` **HOẶC** `referenceType` = `"invoice"` | `"Invoices"` | `{ invoiceId }` nếu có |
| `category` = `"content"` / `"assignment"` **HOẶC** `referenceType` = `"assignment"` / `"homework"` / `"content"` | `"Assignments"` | `{ date }` nếu có |
| `category` = `"attendance"` / `"schedule"` / `"class"` / `"review"` **HOẶC** `referenceType` = `"session"` / `"class"` / `"schedule"` / `"attendance"` | `"Calendar"` | `{ date }` nếu có |
| `category` = `"task"` | `"StaffTasks"` | `{}` |
| `category` = `"chat"` | `"Chat"` | `{ topicId, referenceType }` |
| *(không khớp)* | `null` | `{}` |

> `screen = null` → **không navigate**, ở lại trang danh sách thông báo.

---

### 5B. Mapping từng loại sự kiện → screen & params đầy đủ

| Sự kiện | `screen` | `params` | Ghi chú |
|---|---|---|---|
| Điểm danh (Có học / Vắng / ...) | `Calendar` | `{ date, sessionId, classId }` | scroll đến đúng buổi |
| Nhắc lịch học (chuông trước giờ) | `Calendar` | `{ date, sessionId, classId }` | scroll đến đúng buổi |
| Nhắc lịch dạy (giáo viên) | `Calendar` | `{ date, sessionId, classId }` | scroll đến đúng buổi |
| Nhận xét giáo viên | `Calendar` | `{ date, sessionId, classId }` | scroll đến đúng buổi |
| Giao nội dung / Bài tập / BTVN | `Assignments` | `{ date, classId }` | filter theo ngày + lớp |
| Cập nhật lịch học (buổi đơn) | `Calendar` | `{ date, sessionId, classId }` | `date` = ngày **mới** của buổi |
| Cập nhật chu kỳ học | `Calendar` | `{ date, classId }` | `date` = ngày đầu chu kỳ **mới** |
| Loại trừ lịch học | `Calendar` | `{ date, classId }` | `date` = buổi tiếp theo sau khoảng loại trừ |
| Bảng điểm được publish | `ScoreSheet` | `{ classId }` | mở thẳng bảng điểm của lớp đó |
| Hoá đơn học phí tạo mới | `Invoices` | `{ invoiceId }` | highlight hoá đơn cụ thể |
| Xác nhận / Nhắc thanh toán | `Invoices` | `{ invoiceId }` | highlight hoá đơn cụ thể |
| Tin nhắn chat mới | `Chat` | `{ topicId, referenceType }` | `topicId` = Tinode topic ID |
| Giao việc cho nhân viên | `StaffTasks` | `{}` | — |

> **Tất cả params đều optional về mặt kỹ thuật** — có thể thiếu nếu dữ liệu chưa có lúc tạo noti.  
> App cần kiểm tra `params.date != null` trước khi dùng.

---

### 5C. Screen name và params nhận vào (React Native)

| `deeplink.screen` | Màn hình | `deeplink.params` | Hành vi đề xuất |
|---|---|---|---|
| `"Calendar"` | Lịch học | `date?: string` (YYYY-MM-DD), `sessionId?: string`, `classId?: string` | Scroll đến `date`; nếu có `sessionId` thì highlight đúng buổi; nếu có `classId` thì filter lớp |
| `"Assignments"` | Bài tập / Nội dung | `date?: string` (YYYY-MM-DD), `classId?: string` | Filter theo `date` + lọc theo `classId` nếu có |
| `"ScoreSheet"` | Bảng điểm | `classId?: string` | Nếu có `classId` → mở thẳng bảng điểm lớp đó; không có → trang tổng |
| `"Invoices"` | Học phí | `invoiceId?: string` | Highlight hoá đơn `invoiceId` nếu có |
| `"StaffTasks"` | Danh sách công việc | *(không có params)* | Mở danh sách |
| `"Chat"` | Trò chuyện | `topicId: string`, `referenceType?: string` | Subscribe đúng Tinode topic |
| `null` | *(ở lại trang thông báo)* | — | Không navigate |

---

## 6. Luồng xử lý đề xuất

```javascript
// App foreground / resume
GET /api/mobile/student/notifications/unread-count
  → cập nhật badge số trên icon chuông

GET /api/mobile/student/notifications
  → load danh sách noti

// User click vào 1 notification
PATCH /api/mobile/student/notifications/:id/read   // đánh dấu đã đọc trước

// Sau đó navigate theo deeplink:
const { screen, params } = item.deeplink;

if (screen === "Calendar") {
  navigate("CalendarScreen", {
    date: params.date,          // YYYY-MM-DD — scroll đến ngày này
    sessionId: params.sessionId, // optional — highlight buổi cụ thể
    classId: params.classId,    // optional — filter lớp
  });
} else if (screen === "Assignments") {
  navigate("AssignmentsScreen", {
    date: params.date,          // optional — filter theo ngày
    classId: params.classId,    // optional — filter theo lớp
  });
} else if (screen === "ScoreSheet") {
  navigate("ScoreSheetScreen", {
    classId: params.classId,    // optional — mở thẳng lớp nếu có
  });
} else if (screen === "Invoices") {
  navigate("InvoicesScreen", {
    invoiceId: params.invoiceId, // optional — highlight hoá đơn
  });
} else if (screen === "Chat") {
  navigate("ChatScreen", {
    topicId: params.topicId,
    referenceType: params.referenceType,
  });
} else if (screen === "StaffTasks") {
  navigate("StaffTasksScreen");
}
// screen === null → không navigate
```

---

## 7. Thông báo qua Zalo OA (deeplink ngoài app)

Nếu học viên nhận thông báo qua **Zalo OA** (nút "⚡ Xem chi tiết"), deeplink có dạng:

```
https://zalo.me/s/{MINI_APP_ID}?path={encoded_path}
```

Decode và map vào screen:

| Path (sau decode) | Screen | Params |
|---|---|---|
| `/my-space/calendar?date=YYYY-MM-DD` | **CalendarScreen** | `date` |
| `/my-space/assignments?month=YYYY-MM` | **AssignmentsScreen** | `month` |
| `/my-space/score-sheet` | **ScoreSheetScreen** | — |
| `/my-space/invoices` | **InvoicesScreen** | — |
| `/` | **HomeScreen** | — |
