# Staff Leave Request API — Web PWA

Tài liệu dành cho PWA triển khai tính năng **xin nghỉ phép / nghỉ phép năm / tăng ca của nhân sự**.

## 1. Base URL và xác thực

Tất cả endpoint dùng cùng domain với backend:

```text
BASE_URL = https://<domain-cua-trung-tam>
```

### Cách A — JWT Bearer

Đăng nhập:

```http
POST /api/mobile/auth/login
Content-Type: application/json
```

```json
{
  "username": "TEN_DANG_NHAP",
  "password": "MAT_KHAU"
}
```

Response với tài khoản nhân sự:

```json
{
  "token": "JWT_TOKEN",
  "center": "https://<domain-cua-trung-tam>",
  "needsOnboarding": false,
  "user": {
    "id": "user-uuid",
    "username": "nhansu01",
    "isActive": true
  },
  "userType": "staff",
  "profile": {
    "id": "staff-uuid",
    "fullName": "Nguyễn Văn A",
    "code": "NV-001"
  }
}
```

Các request tiếp theo gửi:

```http
Authorization: Bearer JWT_TOKEN
Content-Type: application/json
```

### Cách B — Session cookie của web

Nếu PWA chạy cùng domain với backend, có thể dùng session cookie:

```ts
fetch(`${BASE_URL}/api/my-space/don-tu`, {
  credentials: "include",
});
```

Không gửi `staffId` từ client khi nhân sự tự tạo đơn. Backend tự lấy nhân sự từ tài khoản đăng nhập.

---

## 2. Loại đơn, trạng thái và format dữ liệu

### Loại đơn

| `type` | Ý nghĩa |
|---|---|
| `nghi_phep` | Nghỉ phép |
| `nghi_co_luong` | Nghỉ phép năm |
| `tang_ca` | Tăng ca |

### Trạng thái

| `status` | Ý nghĩa |
|---|---|
| `pending` | Chờ duyệt |
| `approved` | Đã duyệt |
| `rejected` | Từ chối |

### Format

| Field | Format |
|---|---|
| `fromDate`, `toDate` | `YYYY-MM-DD` |
| `overtimeFrom`, `overtimeTo` | `HH:mm` |
| `hours` | Chuỗi số, ví dụ `"8"`, `"2"`, `"2.5"` |
| ID | UUID |

---

## 3. Lấy thông tin và danh sách đơn của nhân sự đang đăng nhập

```http
GET /api/my-space/don-tu
Authorization: Bearer JWT_TOKEN
```

Endpoint tự nhận diện tài khoản hiện tại. Không cần truyền `staffId`.

### Response `200`

```json
{
  "viewerType": "staff",
  "profile": {
    "id": "staff-uuid",
    "code": "NV-001",
    "fullName": "Nguyễn Văn A"
  },
  "linkedStudents": [],
  "leaveRequests": [
    {
      "id": "leave-request-uuid",
      "staffId": "staff-uuid",
      "locationId": "location-uuid",
      "type": "nghi_phep",
      "fromDate": "2026-09-15",
      "toDate": "2026-09-16",
      "hours": "16",
      "overtimeFrom": null,
      "overtimeTo": null,
      "reason": "Có việc gia đình",
      "status": "pending",
      "adminNote": null,
      "createdAt": "2026-09-15T08:00:00.000Z",
      "updatedAt": "2026-09-15T08:00:00.000Z"
    }
  ],
  "rewards": [],
  "advances": []
}
```

PWA nhân sự lấy danh sách đơn từ `leaveRequests`. Các field `rewards` và `advances` phục vụ những tab khác của trang `/my-space/don-tu`.

### Lỗi

```json
{
  "message": "Unauthorized"
}
```

HTTP `401` nếu chưa đăng nhập.

---

## 4. Nhân sự tự tạo đơn

Đây là endpoint khuyến nghị cho PWA. Endpoint tự lấy nhân sự và cơ sở từ tài khoản đăng nhập.

```http
POST /api/leave-requests/self
Authorization: Bearer JWT_TOKEN
Content-Type: application/json
```

### 4.1. Tạo đơn nghỉ phép / nghỉ phép năm

```json
{
  "type": "nghi_phep",
  "fromDate": "2026-09-15",
  "toDate": "2026-09-16",
  "hours": "16",
  "overtimeFrom": null,
  "overtimeTo": null,
  "reason": "Có việc gia đình"
}
```

`hours` là field không bắt buộc ở backend, nhưng PWA nên gửi tổng số giờ dự kiến. Cách tính thường dùng:

```text
số giờ = số ngày nghỉ × 8
```

### 4.2. Tạo đơn tăng ca

```json
{
  "type": "tang_ca",
  "fromDate": "2026-09-15",
  "toDate": "2026-09-15",
  "hours": "2",
  "overtimeFrom": "17:00",
  "overtimeTo": "19:00",
  "reason": "Hoàn thành công việc cuối ngày"
}
```

Quy tắc:

- `overtimeFrom` và `overtimeTo` là bắt buộc với `tang_ca`.
- `overtimeTo` phải lớn hơn `overtimeFrom`.
- Đơn tăng ca luôn được lưu `toDate` bằng `fromDate`.
- PWA nên gửi `hours` bằng số giờ chênh lệch giữa hai mốc thời gian.

### 4.3. Tạo đơn không có lý do

`reason` có thể bỏ qua hoặc gửi `null`:

```json
{
  "type": "nghi_phep",
  "fromDate": "2026-09-15",
  "toDate": "2026-09-15",
  "hours": "8",
  "reason": null
}
```

### Response `201`

```json
{
  "id": "leave-request-uuid",
  "staffId": "staff-uuid",
  "locationId": "location-uuid",
  "type": "nghi_phep",
  "fromDate": "2026-09-15",
  "toDate": "2026-09-16",
  "hours": "16",
  "overtimeFrom": null,
  "overtimeTo": null,
  "reason": "Có việc gia đình",
  "status": "pending",
  "adminNote": null,
  "createdAt": "2026-09-15T08:00:00.000Z",
  "updatedAt": "2026-09-15T08:00:00.000Z"
}
```

### Quy tắc server

- `staffId` luôn lấy từ tài khoản đăng nhập.
- `locationId` lấy từ assignment mới nhất của nhân sự.
- Đơn mới luôn có `status: "pending"`.
- Không gửi `staffId` hoặc `locationId` tùy ý từ PWA.
- `reason` tối đa 5000 ký tự.

### Lỗi

#### Chưa đăng nhập

HTTP `401`.

#### Tài khoản không phải nhân sự

HTTP `403`:

```json
{
  "message": "Tài khoản không phải nhân sự."
}
```

#### Ngày không hợp lệ

HTTP `400`:

```json
{
  "message": "Ngày bắt đầu không được sau ngày kết thúc"
}
```

#### Thiếu thời gian tăng ca

HTTP `400`:

```json
{
  "message": "Vui lòng nhập thời gian tăng ca."
}
```

#### Khoảng thời gian tăng ca không hợp lệ

HTTP `400`:

```json
{
  "message": "Thời gian tăng ca không hợp lệ."
}
```

#### Body không hợp lệ

HTTP `400`:

```json
{
  "message": "Dữ liệu đơn từ không hợp lệ",
  "issues": []
}
```

---

## 5. API dành cho màn hình quản lý đơn nhân sự

Các endpoint dưới đây dùng cho tài khoản quản lý trang `/don-tu`.

### 5.1. Lấy danh sách đơn nhân sự

```http
GET /api/leave-requests
Authorization: Bearer MANAGER_JWT_TOKEN
```

Query params tùy chọn:

```text
GET /api/leave-requests?type=nghi_phep&status=pending&staffId=staff-uuid
```

| Param | Ý nghĩa |
|---|---|
| `type` | `nghi_phep`, `nghi_co_luong` hoặc `tang_ca` |
| `status` | `pending`, `approved` hoặc `rejected` |
| `staffId` | Lọc theo nhân sự |

Response là mảng các record `leave_requests`:

```json
[
  {
    "id": "leave-request-uuid",
    "staffId": "staff-uuid",
    "locationId": "location-uuid",
    "type": "nghi_phep",
    "fromDate": "2026-09-15",
    "toDate": "2026-09-16",
    "hours": "16",
    "overtimeFrom": null,
    "overtimeTo": null,
    "reason": "Có việc gia đình",
    "status": "pending",
    "adminNote": null,
    "createdAt": "2026-09-15T08:00:00.000Z",
    "updatedAt": "2026-09-15T08:00:00.000Z"
  }
]
```

Nhân sự thường chỉ nhìn thấy các đơn có nhân sự thuộc cơ sở được cấp quyền. Tài khoản admin có thể nhìn thấy toàn bộ.

### 5.2. Duyệt hoặc từ chối đơn

```http
PATCH /api/leave-requests/LEAVE_REQUEST_UUID/status
Authorization: Bearer MANAGER_JWT_TOKEN
Content-Type: application/json
```

#### Duyệt

```json
{
  "status": "approved"
}
```

#### Từ chối

```json
{
  "status": "rejected",
  "adminNote": "Không đủ điều kiện nghỉ trong thời gian này"
}
```

Khi `status = "rejected"`, `adminNote` bắt buộc phải có nội dung.

#### Đưa về chờ duyệt

```json
{
  "status": "pending",
  "adminNote": null
}
```

### Response `200`

Response là record đơn sau khi cập nhật:

```json
{
  "id": "leave-request-uuid",
  "staffId": "staff-uuid",
  "locationId": "location-uuid",
  "type": "nghi_phep",
  "fromDate": "2026-09-15",
  "toDate": "2026-09-16",
  "hours": "16",
  "overtimeFrom": null,
  "overtimeTo": null,
  "reason": "Có việc gia đình",
  "status": "approved",
  "adminNote": null,
  "createdAt": "2026-09-15T08:00:00.000Z",
  "updatedAt": "2026-09-15T09:00:00.000Z"
}
```

Khi trạng thái thực sự chuyển sang `approved` hoặc `rejected`, backend tự gửi notification về tài khoản nhân sự tạo đơn.

### 5.3. Lấy chi tiết một đơn

Hiện backend chưa có endpoint GET riêng theo ID. PWA lấy danh sách bằng:

```http
GET /api/leave-requests?staffId=STAFF_UUID
```

hoặc:

```http
GET /api/my-space/don-tu
```

Sau đó tìm record có `id` bằng `params.requestId`.

### 5.4. Xóa đơn

```http
DELETE /api/leave-requests/LEAVE_REQUEST_UUID
Authorization: Bearer MANAGER_JWT_TOKEN
```

Response:

```http
204 No Content
```

### 5.5. API tạo/sửa trực tiếp cho màn hình quản trị

Backend vẫn có các endpoint tổng quát sau:

```http
POST /api/leave-requests
PUT /api/leave-requests/LEAVE_REQUEST_UUID
```

Các endpoint này nhận `staffId` trong body và dành cho màn hình quản trị nội bộ. **Không dùng `POST /api/leave-requests` cho form tự xin nghỉ của nhân sự**, vì form tự xin nghỉ phải dùng `POST /api/leave-requests/self` để tránh giả mạo nhân sự.

---

## 6. Notification cho PWA web

### 6.1. Lấy danh sách notification

```http
GET /api/notifications
Authorization: Bearer JWT_TOKEN
```

Response là mảng notification mới nhất:

```json
[
  {
    "id": "notification-uuid",
    "userId": "manager-user-uuid",
    "title": "Đơn Nghỉ phép",
    "content": "Nguyễn Văn A (NV-001), xin nghỉ Từ ngày 15/9/2026 - đến ngày 16/9/2026, Loại: Nghỉ phép, Lý do: Có việc gia đình",
    "type": "in-app",
    "category": "staff_leave",
    "referenceId": "leave-request-uuid",
    "referenceType": "staff_leave_request",
    "referenceDate": "2026-09-15",
    "deeplink": {
      "screen": "StaffLeaveRequestManagement",
      "params": {
        "requestId": "leave-request-uuid"
      }
    },
    "isRead": false,
    "createdAt": "2026-09-15T08:00:00.000Z"
  }
]
```

### 6.2. Đếm notification chưa đọc

```http
GET /api/notifications/unread-count
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "count": 1
}
```

### 6.3. Đánh dấu một notification đã đọc

```http
PATCH /api/notifications/NOTIFICATION_UUID/read
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "success": true
}
```

### 6.4. Đánh dấu tất cả đã đọc

```http
PATCH /api/notifications/read-all
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "success": true
}
```

---

## 7. Notification API dạng mobile namespace cho PWA dùng JWT

Nếu PWA muốn dùng nhóm endpoint `/api/mobile`, dùng:

### Danh sách notification nhân sự

```http
GET /api/mobile/staff/notifications?limit=50&offset=0
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "totalUnread": 1,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "notification-uuid",
      "title": "Đơn Nghỉ phép",
      "content": "Nguyễn Văn A (NV-001), xin nghỉ Từ ngày 15/9/2026 - đến ngày 16/9/2026, Loại: Nghỉ phép, Lý do: Có việc gia đình",
      "type": "in-app",
      "category": "staff_leave",
      "referenceId": "leave-request-uuid",
      "referenceType": "staff_leave_request",
      "isRead": false,
      "createdAt": "2026-09-15T08:00:00.000Z",
      "deeplink": {
        "screen": "StaffLeaveRequestManagement",
        "params": {
          "requestId": "leave-request-uuid"
        }
      }
    }
  ]
}
```

Query params:

| Param | Mặc định | Tối đa |
|---|---:|---:|
| `limit` | `50` | `100` |
| `offset` | `0` | Không giới hạn cố định |

### Đếm chưa đọc

```http
GET /api/mobile/staff/notifications/unread-count
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "total": 1
}
```

### Đánh dấu một notification đã đọc

```http
PATCH /api/mobile/staff/notifications/NOTIFICATION_UUID/read
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "success": true
}
```

### Đánh dấu tất cả đã đọc

```http
PATCH /api/mobile/staff/notifications/read-all
Authorization: Bearer JWT_TOKEN
```

Response:

```json
{
  "success": true
}
```

---

## 8. Notification khi tạo đơn và khi có kết quả duyệt

### 8.1. Gửi đến người quản lý khi nhân sự tạo đơn

```json
{
  "title": "Đơn Nghỉ phép",
  "content": "Nguyễn Văn A (NV-001), xin nghỉ Từ ngày 15/9/2026 - đến ngày 16/9/2026, Loại: Nghỉ phép, Lý do: Có việc gia đình",
  "category": "staff_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "staff_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StaffLeaveRequestManagement",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

Notification gửi đến:

- Các tài khoản nhân sự có quyền xem/quản lý `/don-tu` trong cùng cơ sở.
- Tài khoản admin.
- Không gửi lại cho chính nhân sự tạo đơn.

### 8.2. Gửi về nhân sự khi đơn được duyệt

```json
{
  "title": "Đơn Nghỉ phép",
  "content": "Đơn Nghỉ phép, Nguyễn Văn A (NV-001), xin nghỉ Từ ngày 15/9/2026 - đến ngày 16/9/2026, Trạng thái: Đã duyệt",
  "category": "staff_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "staff_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StaffMyLeaveRequests",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

### 8.3. Gửi về nhân sự khi đơn bị từ chối

```json
{
  "title": "Đơn Nghỉ phép",
  "content": "Đơn Nghỉ phép, Nguyễn Văn A (NV-001), xin nghỉ Từ ngày 15/9/2026 - đến ngày 16/9/2026, Trạng thái: Từ chối, Lý do: Không đủ điều kiện nghỉ",
  "category": "staff_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "staff_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StaffMyLeaveRequests",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

---

## 9. Mapping deeplink cho client

### Web PWA

| `deeplink.screen` | Người nhận | Route |
|---|---|---|
| `StaffLeaveRequestManagement` | Nhân sự quản lý đơn nghỉ nhân sự | `/don-tu` |
| `StaffMyLeaveRequests` | Nhân sự đã gửi đơn | `/my-space/don-tu` |
| `StaffLeaveRequests` | Nhân sự quản lý đơn nghỉ học viên/phụ huynh | `/learning-overview?tab=xin-nghi` |
| `StudentLeaveRequests` | Học viên/phụ huynh xem đơn của mình | `/my-space/don-tu` |

PWA nên dùng `params.requestId` để:

1. Mở đúng màn hình.
2. Tải lại danh sách nếu cần.
3. Highlight hoặc scroll đến đúng đơn có ID tương ứng.

### Quy tắc xử lý notification

```ts
async function openNotification(notification: Notification) {
  await fetch(`/api/notifications/${notification.id}/read`, {
    method: "PATCH",
    credentials: "include",
  });

  const screen = notification.deeplink?.screen;
  const params = notification.deeplink?.params ?? {};

  if (screen === "StaffLeaveRequestManagement") {
    navigate(`/don-tu?requestId=${params.requestId ?? ""}`);
    return;
  }

  if (screen === "StaffMyLeaveRequests") {
    navigate(`/my-space/don-tu?requestId=${params.requestId ?? ""}`);
    return;
  }

  if (screen === "StaffLeaveRequests") {
    navigate(`/learning-overview?tab=xin-nghi&requestId=${params.requestId ?? ""}`);
    return;
  }
}
```

> Nếu PWA không hỗ trợ query `requestId`, vẫn có thể mở route gốc rồi reload danh sách theo API.

---

## 10. HTTP status và lỗi chính

| HTTP | Ý nghĩa |
|---:|---|
| `200` | Lấy hoặc cập nhật thành công |
| `201` | Tạo đơn thành công |
| `204` | Xóa thành công |
| `400` | Body, ngày, loại đơn hoặc thời gian tăng ca không hợp lệ |
| `401` | Chưa đăng nhập hoặc JWT/session không hợp lệ |
| `403` | Tài khoản không phải nhân sự hoặc chưa được gán cơ sở |
| `404` | Không tìm thấy đơn hoặc notification |
| `500` | Lỗi server |

Ví dụ lỗi notification không thuộc tài khoản:

```json
{
  "message": "Không tìm thấy thông báo hoặc bạn không có quyền truy cập."
}
```

---

## 11. Flow đề xuất cho PWA nhân sự

### Khi mở trang đơn từ

```text
GET /api/my-space/don-tu
```

Lấy `profile` để hiển thị tên/mã nhân sự và lấy `leaveRequests` để hiển thị danh sách.

### Khi bấm “Thêm mới”

1. Hiển thị loại đơn.
2. Hiển thị ngày bắt đầu/kết thúc.
3. Nếu là `tang_ca`, hiển thị giờ bắt đầu/kết thúc.
4. Nhập lý do.
5. Tính `hours`.
6. Gửi `POST /api/leave-requests/self`.
7. Sau khi `201`, reload `GET /api/my-space/don-tu`.

### Khi nhận notification của đơn mới

1. Gọi endpoint notification.
2. Đọc `category = "staff_leave"`.
3. Đọc `referenceType = "staff_leave_request"`.
4. Dùng `deeplink.screen = "StaffLeaveRequestManagement"`.
5. Navigate đến `/don-tu`.

### Khi nhân sự quản lý duyệt/từ chối

```text
PATCH /api/leave-requests/:id/status
```

Sau khi duyệt hoặc từ chối thành công, backend tự gửi notification về tài khoản nhân sự đã tạo đơn.

### Khi nhân sự nhận kết quả

Dùng `deeplink.screen = "StaffMyLeaveRequests"` và navigate đến:

```text
/my-space/don-tu
```
