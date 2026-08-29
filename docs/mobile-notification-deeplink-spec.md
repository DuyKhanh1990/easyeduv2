# Notification Deeplink Spec — Tài liệu gửi Mobile Team

> **Phiên bản:** 2026-07-16  
> **Áp dụng cho:** cả hai surface học viên/phụ huynh và nhân viên/giáo viên  
> **Lưu ý quan trọng:** Server tính sẵn `deeplink.screen` + `deeplink.params` và lưu vào DB tại thời điểm tạo notification. App **chỉ cần đọc và navigate** theo giá trị này — không cần tự suy luận từ `category` hay `referenceType`. Logic fallback (suy luận từ category) chỉ áp dụng cho notification cũ (tạo trước ngày này, khi cột `deeplink` còn null).

---

## 1. Endpoints

| Surface | Endpoint danh sách | Endpoint badge | Đánh dấu đọc |
|---|---|---|---|
| Học viên / Phụ huynh | `GET /api/mobile/student/notifications` | `GET /api/mobile/student/notifications/unread-count` | `PATCH /api/mobile/student/notifications/:id/read` |
| Nhân viên / Giáo viên | `GET /api/mobile/staff/notifications` | `GET /api/mobile/staff/notifications/unread-count` | `PATCH /api/mobile/staff/notifications/:id/read` |

---

## 2. Cấu trúc response item

```json
{
  "id": "uuid",
  "title": "Thông báo điểm danh",
  "content": "Giáo viên Nguyễn Thị B vừa Điểm danh: Có học, Lớp Toán 10A, Buổi 5, Thứ 2 30/06/2026 08:00-09:30",
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
  }
}
```

---

## 3. Học viên / Phụ huynh — Screen & Params

### 3.1 Bảng screen

| `deeplink.screen` | Màn hình | `deeplink.params` | Hành vi |
|---|---|---|---|
| `"Calendar"` | Lịch học | `date?: string` · `sessionId?: string` · `classId?: string` | Scroll đến `date`; highlight đúng `sessionId`; filter `classId` nếu có |
| `"Assignments"` | Nội dung / Bài tập | `date?: string` · `classId?: string` | Filter theo `date` và `classId` |
| `"ScoreSheet"` | Bảng điểm | `classId?: string` | Mở thẳng lớp nếu có `classId`; không có → trang tổng |
| `"Invoices"` | Học phí | `invoiceId?: string` | Highlight hoá đơn `invoiceId` nếu có |
| `"Chat"` | Chat | `topicId: string` · `referenceType?: string` | Subscribe Tinode topic |
| `null` | — | — | Không navigate, ở lại trang danh sách |

> Tất cả params đều optional — kiểm tra `!= null` trước khi dùng.

---

### 3.2 Mapping từng loại sự kiện (học viên)

| Sự kiện | `screen` | `params` |
|---|---|---|
| Điểm danh (Có học / Vắng / ...) | `Calendar` | `{ date, sessionId, classId }` |
| Nhắc lịch học (chuông trước giờ) | `Calendar` | `{ date, sessionId, classId }` |
| Nhận xét giáo viên | `Calendar` | `{ date, sessionId, classId }` |
| Cập nhật lịch học (buổi đơn) | `Calendar` | `{ date, sessionId, classId }` — `date` = ngày **mới** |
| Cập nhật chu kỳ học | `Calendar` | `{ date, classId }` — `date` = ngày đầu chu kỳ **mới** |
| Loại trừ lịch học | `Calendar` | `{ date, classId }` — `date` = buổi tiếp theo **sau** khoảng loại trừ |
| Giao nội dung / BTVN | `Assignments` | `{ date, classId }` — `date` = ngày buổi học giao nội dung |
| Bảng điểm được publish | `ScoreSheet` | `{ classId }` |
| Hoá đơn học phí tạo mới | `Invoices` | `{ invoiceId }` |
| Xác nhận / Nhắc thanh toán | `Invoices` | `{ invoiceId }` |
| Tin nhắn chat mới | `Chat` | `{ topicId, referenceType }` |

---

### 3.3 Code navigate mẫu (học viên)

```javascript
const { screen, params } = item.deeplink;

switch (screen) {
  case "Calendar":
    navigate("CalendarScreen", {
      date:      params.date,       // YYYY-MM-DD — scroll đến ngày
      sessionId: params.sessionId,  // optional — highlight buổi cụ thể
      classId:   params.classId,    // optional — filter lớp
    });
    break;

  case "Assignments":
    navigate("AssignmentsScreen", {
      date:    params.date,         // optional — filter ngày
      classId: params.classId,      // optional — filter lớp
    });
    break;

  case "ScoreSheet":
    navigate("ScoreSheetScreen", {
      classId: params.classId,      // optional — mở thẳng lớp
    });
    break;

  case "Invoices":
    navigate("InvoicesScreen", {
      invoiceId: params.invoiceId,  // optional — highlight hoá đơn
    });
    break;

  case "Chat":
    navigate("ChatScreen", {
      topicId:       params.topicId,
      referenceType: params.referenceType,
    });
    break;

  // screen === null → không navigate
}
```

---

## 4. Nhân viên / Giáo viên — Screen & Params

### 4.1 Bảng screen

| `deeplink.screen` | Màn hình | `deeplink.params` | Hành vi |
|---|---|---|---|
| `"StaffCalendar"` | Lịch dạy | `date?: string` · `sessionId?: string` · `classId?: string` | Scroll đến `date`; highlight đúng buổi nếu có `sessionId`; filter `classId` |
| `"StaffGradeBook"` | Bảng điểm | `classId?: string` | Mở thẳng bảng điểm lớp nếu có `classId` |
| `"StaffSalary"` | Lương / Tài chính | *(không có params)* | Mở trang lương |
| `"StaffTasks"` | Công việc | `taskId?: string` | Highlight task cụ thể nếu có `taskId` |
| `"Chat"` | Chat | `topicId: string` · `referenceType?: string` | Subscribe Tinode topic |
| `null` | — | — | Không navigate |

> **Lưu ý:** Server tự động dịch `Calendar` → `StaffCalendar`, `ScoreSheet` → `StaffGradeBook` khi trả về cho staff endpoint. App không cần xử lý thêm.

---

### 4.2 Mapping từng loại sự kiện (nhân viên / giáo viên)

| Sự kiện | Nhận bởi | `screen` | `params` |
|---|---|---|---|
| Nhắc lịch dạy (chuông trước giờ) | Giáo viên | `StaffCalendar` | `{ date, sessionId, classId }` |
| Được xếp lịch dạy lớp mới | Giáo viên | `StaffCalendar` | `{ date, classId }` — `date` = buổi đầu tiên |
| Cập nhật lịch học (buổi đơn) | Giáo viên + Quản lý | `StaffCalendar` | `{ date, sessionId, classId }` — `date` = ngày **mới** |
| Cập nhật chu kỳ học | Giáo viên + Quản lý + Học viên | `StaffCalendar` | `{ date, classId }` — `date` = ngày đầu chu kỳ **mới** |
| Loại trừ lịch học | Giáo viên + Quản lý | `StaffCalendar` | `{ date, classId }` — `date` = buổi tiếp theo sau loại trừ |
| Xoá buổi học | Giáo viên + Quản lý | `StaffCalendar` | `{ date, classId }` — `date` = buổi bị xoá đầu tiên |
| Học viên bị xoá khỏi buổi | Giáo viên + Quản lý | `StaffCalendar` | `{ date, classId }` |
| Bảng điểm publish | Giáo viên | `StaffGradeBook` | `{ classId }` |
| Phiếu lương / Thanh toán lương | Nhân viên | `StaffSalary` | *(không có params)* |
| Công việc được giao | Nhân viên | `StaffTasks` | `{ taskId }` |
| Tin nhắn chat mới | Nhân viên / Giáo viên | `Chat` | `{ topicId, referenceType }` |

---

### 4.3 Code navigate mẫu (nhân viên)

```javascript
const { screen, params } = item.deeplink;

switch (screen) {
  case "StaffCalendar":
    navigate("StaffCalendarScreen", {
      date:      params.date,       // YYYY-MM-DD — scroll đến ngày
      sessionId: params.sessionId,  // optional — highlight buổi cụ thể
      classId:   params.classId,    // optional — filter lớp
    });
    break;

  case "StaffGradeBook":
    navigate("StaffGradeBookScreen", {
      classId: params.classId,      // optional — mở thẳng lớp
    });
    break;

  case "StaffSalary":
    navigate("StaffSalaryScreen");
    break;

  case "StaffTasks":
    navigate("StaffTasksScreen", {
      taskId: params.taskId,        // optional — highlight task cụ thể
    });
    break;

  case "Chat":
    navigate("ChatScreen", {
      topicId:       params.topicId,
      referenceType: params.referenceType,
    });
    break;

  // screen === null → không navigate
}
```

---

## 5. Những điểm thay đổi so với tài liệu cũ

| # | Thay đổi | Ảnh hưởng |
|---|---|---|
| 1 | `Calendar` params: thêm `sessionId` và `classId` (trước chỉ có `date`) | Học viên + Nhân viên |
| 2 | `Assignments` params: thêm `classId` (trước chỉ có `date`) | Học viên |
| 3 | `ScoreSheet` params: thêm `classId` (trước không có params) | Học viên |
| 4 | `StaffGradeBook` params: thêm `classId` (trước chỉ có `gradeBookId`) | Nhân viên |
| 5 | "Giao nội dung / BTVN" đổi từ `Assignments { date }` sang `Assignments { date, classId }` | Học viên |
| 6 | "Bảng điểm publish" (mobile API) trước không có deeplink, nay có `ScoreSheet { classId }` | Học viên |
| 7 | Staff endpoint: trước chỉ trả `date`, nay trả đầy đủ `date + sessionId + classId` từ stored deeplink | Nhân viên |

---

## 6. Luồng xử lý chuẩn

```
App foreground / resume:
  GET .../notifications/unread-count → cập nhật badge

User mở trang thông báo:
  GET .../notifications?limit=50&offset=0

User click vào 1 notification:
  1. PATCH .../notifications/:id/read   ← đánh dấu đọc TRƯỚC khi navigate
  2. Đọc item.deeplink.screen + params
  3. Navigate theo bảng trên
```

---

## 7. Fallback (chỉ áp dụng cho notification cũ — `deeplink = null`)

Server tự động suy luận lại từ `category` + `referenceType` + nội dung text. App không cần xử lý case này — server trả về `deeplink.screen` và `deeplink.params` đã resolve sẵn trong response.

> Nếu `deeplink.screen = null` → không navigate, ở lại trang danh sách thông báo.
