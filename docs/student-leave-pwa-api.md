# Student Leave Request API — Web PWA

Tài liệu này dành cho web PWA triển khai tính năng xin nghỉ học cho học viên/phụ huynh và hiển thị notification.

## 1. Base URL và xác thực

Tất cả endpoint dùng cùng domain với backend:

```text
BASE_URL = https://<domain-cua-trung-tam>
```

Có thể xác thực theo một trong hai cách:

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

Response có `token`:

```json
{
  "token": "JWT_TOKEN",
  "userType": "student",
  "profile": {
    "id": "student-uuid",
    "fullName": "Nguyễn Văn A",
    "code": "HV001",
    "type": "Học viên"
  }
}
```

Các request tiếp theo gửi:

```http
Authorization: Bearer JWT_TOKEN
```

`userType` có thể là `student`, `parent` hoặc `staff`.

### Cách B — Session cookie của web

Nếu PWA chạy cùng domain với backend, gửi cookie:

```ts
fetch(url, {
  credentials: "include",
});
```

Không gửi `studentId` tùy ý ngoài danh sách được backend trả về. Backend luôn kiểm tra quyền theo tài khoản đăng nhập.

## 2. Lấy học viên và cơ sở được phép tạo đơn

```http
GET /api/student-leave-requests/self/context
Authorization: Bearer JWT_TOKEN
```

Response cho học viên:

```json
{
  "viewerType": "student",
  "students": [
    {
      "id": "student-uuid",
      "code": "HV001",
      "fullName": "Nguyễn Văn A",
      "locations": [
        {
          "id": "location-uuid",
          "name": "Cơ sở chính"
        }
      ]
    }
  ]
}
```

Response cho phụ huynh:

```json
{
  "viewerType": "parent",
  "students": [
    {
      "id": "child-uuid",
      "code": "HV002",
      "fullName": "Nguyễn Văn B",
      "locations": [
        {
          "id": "location-uuid",
          "name": "Cơ sở chính"
        }
      ]
    }
  ]
}
```

Phụ huynh chỉ được gửi `studentId` thuộc `students` trong response này. Cơ sở phải lấy từ `locations`; API tạo đơn không nhận `locationId` từ client.

## 3. Lấy lịch học thực tế để hiển thị checkbox

```http
GET /api/student-leave-requests/self/schedules
  ?studentId=STUDENT_UUID
  &startDate=2026-09-15
  &endDate=2026-09-17
Authorization: Bearer JWT_TOKEN
```

Đối với tài khoản học viên, `studentId` vẫn nên gửi theo context; backend luôn tự xác thực lại. Đối với phụ huynh, `studentId` là bắt buộc.

Response:

```json
[
  {
    "id": "student-session-uuid",
    "classSessionId": "class-session-uuid",
    "studentId": "student-uuid",
    "className": "IELTS 4.0",
    "classCode": "CLS-001",
    "date": "2026-09-15",
    "time": "18:00 – 20:00",
    "shiftName": "Ca tối",
    "teachers": "Nguyễn Thị C",
    "locationId": "location-uuid",
    "locationName": "Cơ sở chính"
  }
]
```

`id` là `studentSessionId` và là giá trị cần gửi trong `scheduleIds`.

Lịch bị hủy hoặc lịch không thuộc học viên/khoảng ngày sẽ không được trả về.

## 4. Tạo đơn xin nghỉ cho học viên/phụ huynh

```http
POST /api/student-leave-requests/self
Authorization: Bearer JWT_TOKEN
Content-Type: application/json
```

### Học viên

```json
{
  "scheduleIds": [
    "student-session-uuid-1",
    "student-session-uuid-2"
  ],
  "startDate": "2026-09-15",
  "endDate": "2026-09-17",
  "description": "Em bị ốm ạ."
}
```

### Phụ huynh

```json
{
  "studentId": "child-uuid",
  "scheduleIds": [
    "student-session-uuid-1"
  ],
  "startDate": "2026-09-15",
  "endDate": "2026-09-15",
  "description": "Con bị ốm."
}
```

Response `201` là mảng các đơn được tạo:

```json
[
  {
    "id": "leave-request-uuid",
    "studentId": "student-uuid",
    "locationId": "location-uuid",
    "scheduleIds": [
      "student-session-uuid-1"
    ],
    "scheduleSnapshot": [],
    "startDate": "2026-09-15",
    "endDate": "2026-09-17",
    "description": "Em bị ốm ạ.",
    "status": "pending",
    "rejectionReason": null
  }
]
```

### Quy tắc tạo đơn

- Nếu các lịch được chọn cùng một cơ sở, tạo một đơn.
- Nếu các lịch thuộc nhiều cơ sở, tạo một đơn riêng cho mỗi cơ sở.
- Nếu có lịch trong khoảng ngày, phải chọn ít nhất một lịch.
- Nếu không có lịch trong khoảng ngày, `scheduleIds: []` vẫn có thể tạo đơn cho các cơ sở được gán.
- Client không được tự truyền `locationId`.
- Đơn mới luôn có trạng thái `pending`.
- Sau khi tạo đơn, backend gửi notification cho giáo viên của các buổi được chọn và quản lý lớp tương ứng.

## 5. Lấy danh sách đơn của học viên/phụ huynh

```http
GET /api/my-space/don-tu
Authorization: Bearer JWT_TOKEN
```

Response chính:

```json
{
  "viewerType": "student",
  "profile": {
    "id": "student-uuid",
    "code": "HV001",
    "fullName": "Nguyễn Văn A"
  },
  "linkedStudents": [],
  "leaveRequests": [
    {
      "id": "leave-request-uuid",
      "studentId": "student-uuid",
      "studentName": "Nguyễn Văn A",
      "studentCode": "HV001",
      "locationId": "location-uuid",
      "locationName": "Cơ sở chính",
      "scheduleIds": [
        "student-session-uuid"
      ],
      "scheduleSnapshot": [],
      "startDate": "2026-09-15",
      "endDate": "2026-09-15",
      "description": "Em bị ốm ạ.",
      "status": "pending",
      "attendanceApprovalMode": null,
      "rejectionReason": null,
      "createdAt": "2026-09-15T08:00:00.000Z",
      "updatedAt": "2026-09-15T08:00:00.000Z"
    }
  ],
  "rewards": [],
  "advances": []
}
```

Trạng thái:

```text
pending  = Chờ duyệt
approved = Đã duyệt
rejected = Từ chối
```

## 6. API nhân sự xử lý đơn

PWA nhân sự có thể dùng API này tại `/learning-overview`.

### Duyệt đơn

```http
PUT /api/student-leave-requests/LEAVE_REQUEST_UUID
Authorization: Bearer STAFF_JWT_TOKEN
Content-Type: application/json
```

```json
{
  "status": "approved",
  "attendanceApprovalMode": "unchanged"
}
```

`attendanceApprovalMode`:

- `unchanged`: chỉ duyệt đơn, giữ nguyên điểm danh.
- `applied`: duyệt đơn và các buổi đã được cập nhật điểm danh trước đó.

### Từ chối đơn

```json
{
  "status": "rejected",
  "rejectionReason": "Lý do từ chối đơn"
}
```

Khi trạng thái thực sự chuyển sang `approved` hoặc `rejected`, backend tự gửi notification về tài khoản học viên và các tài khoản phụ huynh liên kết.

## 7. Nội dung notification của đơn xin nghỉ

Backend không yêu cầu PWA tự tạo notification. Notification được tạo tự động sau khi API tạo đơn hoặc cập nhật trạng thái thành công.

### Notification gửi cho giáo viên/quản lý khi có đơn mới

```json
{
  "title": "Đơn xin nghỉ học.",
  "content": "Học viên Nguyễn Văn A, xin nghỉ ngày 15/9/2026 lớp: IELTS 4.0, Lý do: Em bị ốm ạ.",
  "category": "student_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "student_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StaffLeaveRequests",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

### Notification trả về học viên/phụ huynh khi đã duyệt

```json
{
  "title": "Đơn xin nghỉ học.",
  "content": "Đơn xin nghỉ, Học viên Nguyễn Văn A, ngày 15/9/2026 Lớp: IELTS 4.0, Trạng thái: Đã duyệt",
  "category": "student_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "student_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StudentLeaveRequests",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

### Notification trả về khi bị từ chối

```json
{
  "title": "Đơn xin nghỉ học.",
  "content": "Đơn xin nghỉ, Học viên Nguyễn Văn A, ngày 15/9/2026 Lớp: IELTS 4.0, Trạng thái: Từ chối, Lý do: Không đủ điều kiện nghỉ",
  "category": "student_leave",
  "referenceId": "leave-request-uuid",
  "referenceType": "student_leave_request",
  "referenceDate": "2026-09-15",
  "deeplink": {
    "screen": "StudentLeaveRequests",
    "params": {
      "requestId": "leave-request-uuid"
    }
  }
}
```

## 8. API notification cho PWA

PWA có thể dùng nhóm endpoint web dưới đây với session cookie hoặc JWT Bearer.

### Lấy danh sách notification

```http
GET /api/notifications
Authorization: Bearer JWT_TOKEN
```

Response là mảng notification, gồm các trường:

```json
[
  {
    "id": "notification-uuid",
    "userId": "user-uuid",
    "title": "Đơn xin nghỉ học.",
    "content": "Đơn xin nghỉ, Học viên Nguyễn Văn A, ngày 15/9/2026 Lớp: IELTS 4.0, Trạng thái: Đã duyệt",
    "type": "in-app",
    "category": "student_leave",
    "referenceId": "leave-request-uuid",
    "referenceType": "student_leave_request",
    "referenceDate": "2026-09-15",
    "deeplink": {
      "screen": "StudentLeaveRequests",
      "params": {
        "requestId": "leave-request-uuid"
      }
    },
    "isRead": false,
    "createdAt": "2026-09-15T08:30:00.000Z"
  }
]
```

Đối với phụ huynh, endpoint này trả notification của phụ huynh và các học viên con đã liên kết.

### Đếm notification chưa đọc

```http
GET /api/notifications/unread-count
Authorization: Bearer JWT_TOKEN
```

```json
{
  "count": 1
}
```

### Đánh dấu một notification đã đọc

```http
PATCH /api/notifications/NOTIFICATION_UUID/read
Authorization: Bearer JWT_TOKEN
```

```json
{
  "success": true
}
```

### Đánh dấu tất cả đã đọc

```http
PATCH /api/notifications/read-all
Authorization: Bearer JWT_TOKEN
```

```json
{
  "success": true
}
```

## 9. API notification dành cho native app

Nếu app đang dùng namespace `/api/mobile`, các endpoint tương ứng là:

### Học viên hoặc phụ huynh xem notification của học viên

```http
GET /api/mobile/student/notifications?limit=50&offset=0
GET /api/mobile/student/notifications/unread-count
PATCH /api/mobile/student/notifications/NOTIFICATION_UUID/read
PATCH /api/mobile/student/notifications/read-all
```

### Phụ huynh xem notification của bản thân và các con

```http
GET /api/mobile/parent/notifications?limit=50&offset=0
GET /api/mobile/parent/notifications/unread-count
PATCH /api/mobile/parent/notifications/NOTIFICATION_UUID/read
PATCH /api/mobile/parent/notifications/read-all
```

Các response đều có notification `category: "student_leave"`, `referenceType: "student_leave_request"` và `deeplink`.

### Nhân sự/giáo viên xem notification có đơn mới

```http
GET /api/mobile/staff/notifications?limit=50&offset=0
GET /api/mobile/staff/notifications/unread-count
PATCH /api/mobile/staff/notifications/NOTIFICATION_UUID/read
PATCH /api/mobile/staff/notifications/read-all
```

### Đăng ký push token cho app

```http
POST /api/mobile/push-token
Authorization: Bearer JWT_TOKEN
Content-Type: application/json
```

```json
{
  "pushToken": "ExponentPushToken[...]",
  "platform": "android"
}
```

Response:

```json
{
  "success": true
}
```

## 10. Deeplink cần hỗ trợ ở client

| Người nhận | `deeplink.screen` | Route/screen đề xuất |
|---|---|---|
| Học viên/phụ huynh trên web PWA | `StudentLeaveRequests` | `/my-space/don-tu` |
| Nhân sự trên web PWA | `StaffLeaveRequests` | `/learning-overview?tab=xin-nghi` |
| Học viên/phụ huynh trên app | `StudentLeaveRequests` | Màn hình đơn từ học viên |
| Nhân sự trên app | `StaffLeaveRequests` | Màn hình xử lý đơn xin nghỉ |

`params.requestId` là ID đơn để client mở đúng bản ghi.

## 11. Quy tắc lỗi chính

| HTTP | Ý nghĩa |
|---|---|
| `400` | Sai ngày, chưa chọn lịch, thiếu lý do từ chối hoặc body không hợp lệ |
| `401` | Chưa đăng nhập hoặc JWT không được gửi |
| `403` | Học viên không thuộc tài khoản, hoặc nhân sự không có quyền cơ sở |
| `404` | Không tìm thấy đơn/notification |
| `500` | Lỗi server |
