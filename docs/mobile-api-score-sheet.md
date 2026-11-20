# EduManage — Tài liệu Mobile API (Toàn bộ)

**Base URL:** `https://<domain>/api/mobile`  
**Authentication:** JWT Bearer Token — header `Authorization: Bearer <token>`  
**Login:** `POST /api/mobile/auth/login` → nhận `token` → đính vào mọi request tiếp theo  

---

## XÁC THỰC (AUTH)

### POST `/api/mobile/auth/login`
Đăng nhập bằng username/password. **Không cần token.**

**Request body:**
```json
{ "username": "string", "password": "string" }
```

**Response 200:**
```json
{
  "token": "eyJhbGci...",
  "center": { "id": "uuid", "name": "Tên trung tâm", ... },
  "needsOnboarding": false,
  "user": { "id": "uuid", "username": "string", "isActive": true },
  "userType": "student | parent | staff | unknown",
  "profile": { "id": "uuid", "fullName": "string", "code": "string", "type": "Học viên | Phụ huynh" }
}
```

> `userType`:  
> - `"student"` — học viên  
> - `"parent"` — phụ huynh (student.type = "Phụ huynh")  
> - `"staff"` — nhân viên / giáo viên  
> - `"unknown"` — tài khoản chưa gắn với bất kỳ đối tượng nào  

---

### POST `/api/mobile/auth/zalo`
Đăng nhập bằng Zalo Access Token (OAuth). **Không cần Bearer token.**

**Request body:**
```json
{ "accessToken": "string" }
```

**Response 200:** Tương tự `/auth/login`

---

---

## I. API MOBILE STUDENT (HỌC VIÊN)

> Các API này dùng được cho cả **học viên** và **phụ huynh** (phụ huynh sẽ thấy dữ liệu của tất cả con được liên kết).  
> Yêu cầu: `Authorization: Bearer <token>` với tài khoản `userType = "student"` hoặc `"parent"`.

---

### GET `/api/mobile/schedule/today`
Lịch học hôm nay (học viên thấy lịch của mình, staff thấy lịch dạy).

**Response (học viên):**
```json
[
  {
    "classSessionId": "uuid",
    "studentSessionId": "uuid",
    "sessionDate": "YYYY-MM-DD",
    "sessionIndex": 5,
    "weekday": 2,
    "className": "Văn 9",
    "classCode": "VAN9-01",
    "onlineLink": "https://meet.google.com/xxx",
    "locationName": "Cơ sở 1",
    "startTime": "08:00",
    "endTime": "10:00",
    "learningFormat": "offline | online",
    "sessionStatus": "scheduled | attended | cancelled",
    "teacherNames": ["Nguyễn Văn A"],
    "attendanceStatus": "pending | attended | absent",
    "attendanceNote": "string | null",
    "student": { "id": "uuid", "name": "string", "code": "string" },
    "isParent": false
  }
]
```

---

### GET `/api/mobile/student/calendar?month=YYYY-MM`
Lịch học toàn bộ trong tháng (đầy đủ thông tin, kèm buổi kiểm tra TEST).

**Query params:**
| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | Tháng cần xem, định dạng `YYYY-MM`. Mặc định: tháng hiện tại |

**Response:**
```json
{
  "month": "2025-10",
  "datesWithSessions": ["2025-10-01", "2025-10-03", "..."],
  "sessions": [
    {
      "classSessionId": "uuid",
      "studentSessionId": "uuid | null",
      "sessionDate": "2025-10-01",
      "sessionIndex": 3,
      "weekday": 3,
      "className": "Văn 9",
      "classCode": "VAN9-01",
      "onlineLink": "string | null",
      "locationId": "uuid | null",
      "locationName": "string | null",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline | online",
      "sessionStatus": "scheduled | attended | cancelled",
      "teacherNames": ["string"],
      "attendanceStatus": "pending | attended | absent | null",
      "student": { "id": "uuid", "name": "string", "code": "string" },
      "isParent": false,
      "isTestSession": false
    }
  ]
}
```

---

### GET `/api/mobile/student/calendar/month?month=YYYY-MM`
Chỉ trả về **danh sách ngày có buổi học** — dùng để hiển thị dấu chấm tròn trên lịch (1 request/tháng, nhẹ hơn).

**Response:**
```json
{
  "month": "2025-10",
  "datesWithSessions": ["2025-10-01", "2025-10-03", "2025-10-08"]
}
```

---

### GET `/api/mobile/student/calendar/day?date=YYYY-MM-DD`
Chi tiết tất cả buổi học trong ngày. Kèm nội dung bài học, nhận xét giáo viên.

**Query params:**
| Param | Bắt buộc | Mô tả |
|---|---|---|
| `date` | Không | Ngày cần xem `YYYY-MM-DD`. Mặc định: hôm nay |

**Response:** Mảng session (tương tự `/calendar` nhưng đầy đủ hơn, kèm `reviewData`, `generalContents`, `personalContents`).

---

### GET `/api/mobile/student/session/:classSessionId`
Chi tiết một buổi học cụ thể. Kèm: giáo viên, nội dung bài, nhận xét, link online, thông tin điểm danh.

**Path params:** `classSessionId` — ID buổi học  
**Query params:** `?studentId=uuid` (tùy chọn, cho phụ huynh chọn con cụ thể)

**Response:**
```json
{
  "classSessionId": "uuid",
  "studentSessionId": "uuid | null",
  "sessionDate": "2025-10-15",
  "sessionIndex": 5,
  "weekday": 3,
  "className": "Văn 9",
  "classCode": "VAN9-01",
  "onlineLink": "string | null",
  "locationId": "uuid | null",
  "locationName": "string | null",
  "startTime": "08:00",
  "endTime": "10:00",
  "learningFormat": "offline | online",
  "sessionStatus": "scheduled",
  "teacherNames": ["string"],
  "attendanceStatus": "pending | attended | absent | null",
  "attendanceNote": "string | null",
  "reviewPublished": true,
  "reviewData": [
    { "criteriaId": "uuid", "criteriaName": "Thái độ", "value": "Tốt", "note": "..." }
  ],
  "generalContents": [
    {
      "id": "uuid",
      "type": "BTVN | Bài kiểm tra | string",
      "title": "string",
      "description": "string | null",
      "resourceUrl": "string | null",
      "attachments": [{ "name": "string", "url": "string" }],
      "availableAt": "ISO8601 | null",
      "maxAttempts": 3
    }
  ],
  "personalContents": [],
  "student": { "id": "uuid", "name": "string", "code": "string" },
  "isParent": false,
  "enrolledCount": 12,
  "onlineClickedAt": "ISO8601 | null",
  "onlineEndedAt": "ISO8601 | null",
  "onlineRule": {
    "earlyEntryMinutes": 15,
    "lateEntryMinutes": 10,
    "earlyEndMinutes": 5
  },
  "isTestSession": false
}
```

---

### POST `/api/mobile/student/session/:classSessionId/online-click`
Ghi nhận học viên bấm vào link học online (bắt đầu vào học).

**Query params:** `?studentId=uuid` (tùy chọn)  
**Response:** `{ "onlineClickedAt": "ISO8601" }`

---

### POST `/api/mobile/student/session/:classSessionId/online-end`
Ghi nhận học viên kết thúc học online.

**Query params:** `?studentId=uuid` (tùy chọn)  
**Response:** `{ "onlineEndedAt": "ISO8601" }`

---

### GET `/api/mobile/online-learning-rules`
Cấu hình thời gian mở/đóng nút vào học online theo từng cơ sở. Dùng để tính `canJoin` / `canEnd`.

**Response:**
```json
[
  {
    "id": "uuid",
    "locationId": "uuid",
    "earlyEntryMinutes": 15,
    "lateEntryMinutes": 10,
    "earlyEndMinutes": 5
  }
]
```

> Logic: nút **Vào học** hiện từ `startTime - earlyEntryMinutes` đến `startTime + lateEntryMinutes`.  
> Nút **Kết thúc** hiện từ `endTime - earlyEndMinutes`.

---

### GET `/api/mobile/student/invoices`
Danh sách hoá đơn học phí của học viên (hoặc các con nếu là phụ huynh).

**Response:**
```json
{
  "invoices": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "title": "Học phí tháng 10",
      "code": "HD-001",
      "label": "Đợt 1 | null",
      "type": "Thu",
      "category": "string | null",
      "amount": "5000000",
      "paidAmount": "5000000 | null",
      "remainingAmount": "0 | null",
      "status": "paid | unpaid | partial | debt",
      "dueDate": "ISO8601 | null",
      "paidAt": "ISO8601 | null",
      "createdAt": "ISO8601",
      "isSchedule": false,
      "student": { "id": "uuid", "name": "string", "code": "string" },
      "isParent": false
    }
  ],
  "summary": {
    "totalPaid": 5000000,
    "totalUnpaid": 2000000,
    "totalAmount": 7000000
  },
  "isParent": false
}
```

> `isSchedule = true` → đây là kỳ thanh toán (installment) thuộc về 1 hoá đơn lớn hơn.

---

### GET `/api/mobile/student/assignments`
Bài tập về nhà (BTVN) + bài kiểm tra theo tháng hoặc khoảng ngày.

**Query params:**
| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | `YYYY-MM` — mặc định tháng hiện tại |
| `dateFrom` | Không | `YYYY-MM-DD` — dùng thay cho `month` |
| `dateTo` | Không | `YYYY-MM-DD` — dùng kèm `dateFrom` |
| `status` | Không | `submitted | pending | all` — mặc định `all` |
| `className` | Không | Lọc theo tên lớp |

**Response:**
```json
{
  "month": "2025-10",
  "rows": [
    {
      "classSessionId": "uuid",
      "className": "Văn 9",
      "classCode": "VAN9-01",
      "sessionDate": "2025-10-10",
      "weekday": 5,
      "startTime": "08:00",
      "endTime": "10:00",
      "sessionIndex": 4,
      "studentId": "uuid",
      "studentName": "Trần Thị B",
      "itemType": "BTVN | Bài kiểm tra",
      "homeworkId": "uuid",
      "homeworkTitle": "Luyện đọc chương 3",
      "homeworkDescription": "string | null",
      "homeworkAttachments": [{ "name": "file.pdf", "url": "https://..." }],
      "isPersonalized": false,
      "submissionStatus": "submitted | pending",
      "submissionContent": "string | null",
      "submissionAttachments": [{ "name": "string", "url": "string" }],
      "studentSessionContentId": "uuid | null",
      "score": "9 | null",
      "comment": "Làm tốt | null",
      "examId": "uuid | null",
      "adjustedScore": "9.5 | null"
    }
  ]
}
```

---

### POST `/api/mobile/student/assignments/submit`
Nộp bài tập về nhà.

**Request body:**
```json
{
  "homeworkId": "uuid",
  "submissionContent": "Nội dung bài làm (text/html)",
  "submissionAttachments": ["TênFile||https://url-file"]
}
```

> `submissionAttachments`: mỗi phần tử là chuỗi dạng `"TênHiệnThị||https://url"`.

**Response:** `{ "success": true }`

---

### GET `/api/mobile/student/exam/:examId/attempt-count`
Kiểm tra số lần đã làm bài và giới hạn của một đề thi.

**Path params:** `examId`  
**Query params:** `?studentId=uuid` (tùy chọn), `?classId=uuid` (tùy chọn)

**Response:**
```json
{ "count": 2, "maxAttempts": 3 }
```

---

### GET `/api/mobile/student/score-sheet`
Danh sách bảng điểm đã công bố.

> **Điều kiện hiển thị:** Bảng điểm chỉ hiện khi học viên đó có **ít nhất 1 điểm (khác rỗng)** hoặc **có nhận xét giáo viên**.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Bảng điểm buổi 3",
    "classId": "uuid",
    "scoreSheetId": "uuid",
    "sessionId": "uuid | null",
    "published": true,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601",
    "classCode": "VAN9-01",
    "className": "Văn 9",
    "scoreSheetName": "Bảng điểm cuối khoá",
    "sessionIndex": 3,
    "sessionDate": "2025-10-15",
    "scores": [
      { "categoryId": "uuid", "categoryName": "Nghe", "score": "8.5" },
      { "categoryId": "uuid", "categoryName": "Tổng", "score": "34" }
    ],
    "teacherComment": "<p>Học tốt...</p> | plain text | null",
    "createdByName": "string | null",
    "student": { "id": "uuid", "name": "string", "code": "string" },
    "isParent": false
  }
]
```

> - `scores` — sắp xếp theo thứ tự mẫu bảng điểm, tiêu chí cuối thường là tổng kết  
> - `teacherComment` — có thể là HTML (bắt đầu bằng `<`) hoặc plain text  
> - Phụ huynh: mảng gộp bảng điểm của tất cả con, phân biệt qua `student.id`

---

### POST `/api/mobile/test-content-attempt`
Ghi nhận / kiểm tra lượt làm nội dung trong buổi kiểm tra TEST.

**Request body:**
```json
{
  "testSessionId": "uuid",
  "contentId": "uuid",
  "contentType": "BTVN | Bài kiểm tra",
  "studentId": "uuid"
}
```

**Response:** `{ "success": true, "attemptCount": 1, "maxAttempts": 3, "canAttempt": true }`

---

---

## II. API MOBILE PHỤ HUYNH (PARENT)

> Yêu cầu: tài khoản `userType = "parent"` (student.type = "Phụ huynh").  
> **Lưu ý:** Hầu hết API Section I đều hoạt động cho phụ huynh — dữ liệu trả về tự động bao gồm tất cả con được liên kết.

---

### GET `/api/mobile/parent/profile`
Thông tin phụ huynh + danh sách con được liên kết + lớp đang học.

**Response:**
```json
{
  "parent": {
    "id": "uuid",
    "code": "PH-001",
    "fullName": "Nguyễn Văn A",
    "type": "Phụ huynh",
    "phone": "0901234567",
    "email": "email@example.com",
    "dateOfBirth": "1980-05-15",
    "gender": "Nam | Nữ | null",
    "address": "string | null",
    "relationship": "Cha | Mẹ | null",
    "accountStatus": "active | inactive | null",
    "status": "string | null"
  },
  "linkedStudents": [
    {
      "id": "uuid",
      "code": "HV-0042",
      "fullName": "Nguyễn Thị B",
      "phone": "string | null",
      "email": "string | null",
      "dateOfBirth": "2012-03-10",
      "gender": "Nữ | null",
      "address": "string | null",
      "accountStatus": "active | null",
      "status": "string | null",
      "enrolledClasses": [
        {
          "classId": "uuid",
          "classCode": "VAN9-01",
          "className": "Văn 9",
          "status": "active | waiting | paused | completed | dropped",
          "startDate": "2025-01-10",
          "endDate": "2025-12-31",
          "totalSessions": 48,
          "attendedSessions": 20,
          "remainingSessions": 10
        }
      ]
    }
  ]
}
```

---

### GET `/api/mobile/parent/notifications`
Danh sách thông báo của phụ huynh + tất cả con (gộp chung, phân trang).

**Query params:**
| Param | Mặc định | Mô tả |
|---|---|---|
| `limit` | 50 | Số thông báo mỗi trang, tối đa 100 |
| `offset` | 0 | Vị trí bắt đầu |

**Response:**
```json
{
  "totalUnread": 5,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "title": "Thông báo bảng điểm",
      "content": "Giáo viên vừa gửi bảng điểm...",
      "type": "string",
      "category": "general | schedule | payment | ...",
      "referenceId": "uuid | null",
      "referenceType": "class | invoice | null",
      "isRead": false,
      "createdAt": "ISO8601",
      "student": { "id": "uuid", "fullName": "string", "code": "string" },
      "isSelf": false
    }
  ]
}
```

> `student` — thông tin con nếu thông báo thuộc về con; `null` nếu thông báo của phụ huynh  
> `isSelf` — `true` nếu thông báo gửi trực tiếp cho tài khoản phụ huynh

---

### GET `/api/mobile/parent/notifications/unread-count`
Số thông báo chưa đọc (tổng + phân theo từng con).

**Response:**
```json
{
  "total": 5,
  "byStudent": [
    { "studentId": "uuid", "fullName": "Nguyễn Thị B", "code": "HV-0042", "unread": 3 }
  ]
}
```

---

### PATCH `/api/mobile/parent/notifications/:id/read`
Đánh dấu 1 thông báo là đã đọc.

**Path params:** `id` — ID thông báo  
**Response:** `{ "success": true }`  
**Lỗi 404:** Thông báo không tồn tại hoặc không thuộc phụ huynh/con

---

### PATCH `/api/mobile/parent/notifications/read-all`
Đánh dấu tất cả thông báo là đã đọc (của phụ huynh + tất cả con).

**Response:** `{ "success": true }`

---

---

## III. API MOBILE STAFF — GIÁO VIÊN / TRỢ GIẢNG

> Yêu cầu: `userType = "staff"`.  
> Các API bảng điểm (`grade-books`) cần thêm điều kiện: staff phải là **teacher** hoặc **manager** của lớp **VÀ** có phân công cơ sở (`staff_assignments`) khớp với cơ sở của lớp.

---

### GET `/api/mobile/staff/calendar?month=YYYY-MM`
Lịch dạy theo tháng của giáo viên.

**Query params:** `month=YYYY-MM` (mặc định tháng hiện tại)

**Response:**
```json
{
  "month": "2025-10",
  "datesWithSessions": ["2025-10-01", "..."],
  "sessions": [
    {
      "classSessionId": "uuid",
      "classId": "uuid",
      "sessionDate": "2025-10-01",
      "weekday": 3,
      "className": "Văn 9",
      "classCode": "VAN9-01",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline | online",
      "sessionStatus": "scheduled | completed | cancelled",
      "sessionIndex": 5,
      "locationName": "Cơ sở 1",
      "enrolledCount": 12,
      "attendancePendingCount": 3
    }
  ]
}
```

---

### GET `/api/mobile/staff/calendar/session/:classSessionId`
Chi tiết một buổi dạy cụ thể cho giáo viên. Kèm: nội dung bài, thống kê điểm danh, danh sách giáo viên.

**Path params:** `classSessionId`

**Response:**
```json
{
  "classSessionId": "uuid",
  "classId": "uuid",
  "sessionDate": "2025-10-01",
  "weekday": 3,
  "className": "Văn 9",
  "classCode": "VAN9-01",
  "startTime": "08:00",
  "endTime": "10:00",
  "learningFormat": "offline | online",
  "sessionStatus": "scheduled",
  "sessionIndex": 5,
  "totalSessions": 48,
  "locationName": "Cơ sở 1",
  "teachers": [{ "id": "uuid", "fullName": "Nguyễn Văn A" }],
  "evaluationCriteriaIds": ["uuid"],
  "generalContents": [
    {
      "id": "uuid",
      "type": "BTVN | string",
      "title": "string",
      "description": "string | null",
      "resourceUrl": "string | null",
      "attachments": [{ "name": "string", "url": "string" }]
    }
  ],
  "enrolledCount": 12,
  "attendancePendingCount": 5,
  "reviewedCount": 7
}
```

---

### GET `/api/mobile/staff/calendar/session/:classSessionId/students`
Danh sách học viên trong buổi dạy — điểm danh + trạng thái nhận xét.

**Path params:** `classSessionId`

**Response:**
```json
[
  {
    "studentSessionId": "uuid",
    "studentId": "uuid",
    "studentName": "Trần Thị B",
    "studentCode": "HV-0042",
    "attendanceStatus": "pending | attended | absent",
    "attendanceNote": "string",
    "sessionOrder": 3,
    "hasReview": true,
    "reviewPublished": false
  }
]
```

---

### GET `/api/mobile/staff/score-sheet`
Danh sách **tất cả** bảng điểm thuộc các lớp giáo viên đang dạy/quản lý.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Bảng điểm tháng 10",
    "classId": "uuid",
    "classCode": "VAN9-01",
    "className": "Văn 9",
    "scoreSheetId": "uuid",
    "scoreSheetName": "Bảng điểm cuối khoá",
    "sessionId": "uuid | null",
    "sessionIndex": 3,
    "sessionDate": "2025-10-15",
    "published": true,
    "scoreCount": 30,
    "studentCount": 6,
    "createdByName": "Nguyễn Văn A",
    "updatedByName": "string | null",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

---

### GET `/api/mobile/staff/classes`
Danh sách lớp mà staff đang dạy hoặc quản lý.

**Response:**
```json
[
  {
    "id": "uuid",
    "classCode": "VAN9-01",
    "name": "Văn 9 — Nhóm 1",
    "locationId": "uuid",
    "scoreSheetId": "uuid | null"
  }
]
```

---

### GET `/api/mobile/score-sheets`
Danh sách tất cả **mẫu bảng điểm** (templates) kèm các hạng mục. Mọi tài khoản đã đăng nhập đều dùng được.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Bảng điểm cuối khoá",
    "items": [
      {
        "id": "uuid",
        "scoreSheetId": "uuid",
        "categoryId": "uuid",
        "formula": "= nghe + noi",
        "order": 1,
        "category": { "id": "uuid", "name": "Tổng", "code": "tong" }
      }
    ]
  }
]
```

---

### GET `/api/mobile/staff/classes/:classId/sessions`
Danh sách buổi học của một lớp (dùng khi tạo/sửa bảng điểm để chọn buổi).

**Path params:** `classId`

**Response:**
```json
[
  {
    "id": "uuid",
    "sessionIndex": 5,
    "sessionDate": "2025-10-15",
    "weekday": 3,
    "startTime": "08:00",
    "endTime": "10:00"
  }
]
```

---

### GET `/api/mobile/staff/classes/:classId/active-students`
Danh sách học viên đang học (status = `active`) trong lớp.

**Path params:** `classId`

**Response:**
```json
[
  {
    "id": "uuid",
    "fullName": "Trần Thị B",
    "code": "HV-0042",
    "phone": "0901234567 | null",
    "email": "email@example.com | null"
  }
]
```

---

### GET `/api/mobile/staff/classes/:classId/grade-books`
Danh sách bảng điểm của một lớp cụ thể (cả draft lẫn published).

**Path params:** `classId`

**Response:**
```json
[
  {
    "id": "uuid",
    "classId": "uuid",
    "title": "Bảng điểm tháng 10",
    "scoreSheetId": "uuid",
    "scoreSheetName": "string | null",
    "sessionId": "uuid | null",
    "published": false,
    "createdBy": "uuid | null",
    "updatedBy": "uuid | null",
    "createdByName": "string | null",
    "updatedByName": "string | null",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

---

### GET `/api/mobile/staff/classes/:classId/grade-books/:id`
Chi tiết điểm + nhận xét của một bảng điểm.

**Path params:** `classId`, `id`

**Response:**
```json
{
  "scores": [
    {
      "id": "uuid",
      "gradeBookId": "uuid",
      "studentId": "uuid",
      "categoryId": "uuid",
      "score": "8.5 | null"
    }
  ],
  "studentComments": {
    "<studentId>": "Nhận xét nội dung..."
  }
}
```

---

### POST `/api/mobile/staff/classes/:classId/grade-books`
Tạo bảng điểm mới. Khi `published = true` → tự động gửi thông báo cho học viên.

**Path params:** `classId`

**Request body:**
```json
{
  "title": "Bảng điểm tháng 10",
  "scoreSheetId": "uuid",
  "sessionId": "uuid | null",
  "published": false,
  "scores": [
    { "studentId": "uuid", "categoryId": "uuid", "score": "8.5" }
  ],
  "studentComments": {
    "<studentId>": "Học viên tiến bộ..."
  }
}
```

**Response 201:** Bảng điểm vừa tạo (grade book object)

---

### PUT `/api/mobile/staff/classes/:classId/grade-books/:id`
Cập nhật bảng điểm. Khi chuyển từ `unpublished → published` → gửi thông báo.

> **Lưu ý quan trọng:** Nếu gửi `scores`, hệ thống **xoá toàn bộ điểm cũ** và thay bằng mảng mới. Tương tự với `studentComments`.

**Request body:** (tất cả optional)
```json
{
  "title": "string",
  "scoreSheetId": "uuid",
  "sessionId": "uuid | null",
  "published": true,
  "scores": [
    { "studentId": "uuid", "categoryId": "uuid", "score": "9" }
  ],
  "studentComments": { "<studentId>": "string" }
}
```

**Response 200:** Bảng điểm đã cập nhật

---

### DELETE `/api/mobile/staff/classes/:classId/grade-books/:id`
Xoá bảng điểm (kèm toàn bộ điểm và nhận xét).

**Path params:** `classId`, `id`  
**Response:** `{ "success": true }`

---

---

## IV. API MOBILE STAFF — KHÁC (THEO PHÂN QUYỀN)

---

### GET `/api/mobile/staff/invoices`
Phiếu chi lương của nhân viên. Chỉ trả về các phiếu chi thuộc bảng lương đã **công bố** cho nhân viên đó.

**Query params:**
| Param | Mặc định | Mô tả |
|---|---|---|
| `status` | — | Lọc `paid | unpaid | partial | debt` |
| `page` | 1 | Trang hiện tại |
| `limit` | 20 | Số item/trang, tối đa 100 |

**Response:**
```json
{
  "invoices": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "title": "Lương tháng 10",
      "code": "LC-001",
      "settleCode": "string | null",
      "label": "Đợt 1 | null",
      "type": "Chi",
      "category": "string | null",
      "amount": "8000000",
      "paidAmount": "8000000 | null",
      "remainingAmount": "0 | null",
      "status": "paid | unpaid | partial | debt",
      "dueDate": "ISO8601 | null",
      "paidAt": "ISO8601 | null",
      "paymentMethod": "cash | bank_transfer | null",
      "note": "string | null",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "isSchedule": false,
      "salaryTable": {
        "id": "uuid",
        "name": "Bảng lương T10/2025",
        "startDate": "ISO8601",
        "endDate": "ISO8601",
        "locationName": "Cơ sở 1"
      }
    }
  ],
  "summary": { "totalPaid": 8000000, "totalUnpaid": 0, "totalAmount": 8000000 },
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 },
  "staff": { "id": "uuid", "fullName": "string", "code": "string" }
}
```

---

### GET `/api/mobile/staff/assignments`
Bài tập + bài kiểm tra của **Phòng Đào tạo** (chỉ nhân viên thuộc Phòng Đào tạo được dùng).

**Query params:**
| Param | Mặc định | Mô tả |
|---|---|---|
| `month` | Tháng hiện tại | `YYYY-MM` |
| `dateFrom` | — | `YYYY-MM-DD` |
| `dateTo` | — | `YYYY-MM-DD` |
| `status` | `all` | `submitted | pending | all` |
| `className` | — | Lọc theo tên lớp |
| `studentId` | — | Lọc theo UUID học viên |
| `studentName` | — | Lọc theo tên học viên |

**Response:** (tương tự `/student/assignments`, thêm `score`, `comment`, `studentSessionContentId`)
```json
{
  "month": "2025-10",
  "rows": [
    {
      "classSessionId": "uuid",
      "className": "string",
      "classCode": "string",
      "sessionDate": "YYYY-MM-DD",
      "studentId": "uuid",
      "studentName": "string",
      "itemType": "BTVN | Bài kiểm tra",
      "homeworkId": "uuid",
      "homeworkTitle": "string",
      "submissionStatus": "submitted | pending",
      "submissionContent": "string | null",
      "submissionAttachments": [{ "name": "string", "url": "string" }],
      "studentSessionContentId": "uuid | null",
      "score": "9 | null",
      "comment": "string | null",
      "examId": "uuid | null"
    }
  ]
}
```

---

### POST `/api/mobile/staff/assignments/grade`
Chấm điểm bài tập (chỉ **Phòng Đào tạo**).

**Request body:**
```json
{
  "studentSessionContentId": "uuid",
  "score": "8.5",
  "gradingComment": "Làm tốt, cần cải thiện phần 2"
}
```

**Response:** `{ "success": true }`

---

### GET `/api/mobile/learning-overview/summary`
Số badge nhanh cho trang Learning Overview (tất cả nhân viên).

**Response:**
```json
{
  "studentsEndingSoon": 5,
  "classesEndingSoon": 2
}
```

> Dữ liệu lọc theo cơ sở của nhân viên. Super admin thấy toàn bộ.

---

### GET `/api/mobile/students-ending-soon`
Danh sách học viên sắp hết lịch (remaining_sessions ≤ 10). Lọc theo cơ sở nhân viên được phân công.

**Query params:**
| Param | Mặc định | Mô tả |
|---|---|---|
| `page` | 1 | Trang hiện tại |
| `pageSize` | 20 | Số dòng/trang (10–50) |
| `search` | — | Tìm theo tên hoặc mã học viên |
| `classes` | — | Lọc theo class_code (lặp lại: `classes=A&classes=B`) |
| `maxRemaining` | — | Chỉ hiện học viên có buổi còn lại ≤ giá trị này |
| `dateFrom` | — | Lọc ngày kết thúc ≥ `YYYY-MM-DD` |
| `dateTo` | — | Lọc ngày kết thúc ≤ `YYYY-MM-DD` |
| `statusFilter` | — | `ending-soon | active | ended` |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "studentId": "uuid",
      "classId": "uuid",
      "status": "active",
      "startDate": "2025-01-10",
      "endDate": "2025-12-31",
      "studentStatus": "string",
      "totalSessions": 48,
      "attendedSessions": 38,
      "remainingSessions": 3,
      "studentCode": "HV-001",
      "studentName": "Trần Thị B",
      "studentPhone": "0901234567",
      "studentEmail": "string | null",
      "classCode": "VAN9-01",
      "className": "Văn 9"
    }
  ],
  "total": 25,
  "page": 1,
  "pageSize": 20,
  "availableClasses": [
    { "code": "VAN9-01", "label": "Văn 9 — Nhóm 1" }
  ]
}
```

> Màu cảnh báo:  
> 🔴 `remainingSessions ≤ 2` — Rất gấp  
> 🟠 `3–4` — Sắp hết  
> 🟡 `5–10` — Cần chú ý

---

### GET `/api/student-sessions/:id/review`
Lấy nhận xét (reviewData) của một student session cụ thể. Mọi tài khoản đã đăng nhập.

**Path params:** `id` — student session ID

**Response:**
```json
{
  "reviewData": [
    { "criteriaId": "uuid", "criteriaName": "Thái độ", "value": "Tốt", "note": "..." }
  ],
  "reviewPublished": true
}
```

---

---

## Bảng tổng hợp tất cả endpoints

| Method | Endpoint | Nhóm | Phân quyền |
|---|---|---|---|
| POST | `/api/mobile/auth/login` | Auth | Public |
| POST | `/api/mobile/auth/zalo` | Auth | Public |
| GET | `/api/mobile/schedule/today` | Student + Staff | Đã đăng nhập |
| GET | `/api/mobile/student/calendar` | Student | Student / Parent |
| GET | `/api/mobile/student/calendar/month` | Student | Student / Parent |
| GET | `/api/mobile/student/calendar/day` | Student | Student / Parent |
| GET | `/api/mobile/student/session/:id` | Student | Student / Parent |
| POST | `/api/mobile/student/session/:id/online-click` | Student | Student / Parent |
| POST | `/api/mobile/student/session/:id/online-end` | Student | Student / Parent |
| GET | `/api/mobile/online-learning-rules` | Student | Đã đăng nhập |
| POST | `/api/mobile/test-content-attempt` | Student | Student / Parent |
| GET | `/api/mobile/student/invoices` | Student | Student / Parent |
| GET | `/api/mobile/student/assignments` | Student | Student / Parent |
| POST | `/api/mobile/student/assignments/submit` | Student | Student |
| GET | `/api/mobile/student/exam/:id/attempt-count` | Student | Student / Parent |
| GET | `/api/mobile/student/score-sheet` | Student | Student / Parent |
| GET | `/api/mobile/parent/profile` | Parent | Parent |
| GET | `/api/mobile/parent/notifications` | Parent | Parent |
| GET | `/api/mobile/parent/notifications/unread-count` | Parent | Parent |
| PATCH | `/api/mobile/parent/notifications/:id/read` | Parent | Parent |
| PATCH | `/api/mobile/parent/notifications/read-all` | Parent | Parent |
| GET | `/api/mobile/staff/calendar` | Staff | Staff |
| GET | `/api/mobile/staff/calendar/session/:id` | Staff | Staff |
| GET | `/api/mobile/staff/calendar/session/:id/students` | Staff | Staff |
| GET | `/api/mobile/staff/score-sheet` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/staff/classes` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/score-sheets` | Staff | Đã đăng nhập |
| GET | `/api/mobile/staff/classes/:classId/sessions` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/staff/classes/:classId/active-students` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/staff/classes/:classId/grade-books` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/staff/classes/:classId/grade-books/:id` | Staff | Staff (GV/Quản lý lớp) |
| POST | `/api/mobile/staff/classes/:classId/grade-books` | Staff | Staff (GV/Quản lý lớp) |
| PUT | `/api/mobile/staff/classes/:classId/grade-books/:id` | Staff | Staff (GV/Quản lý lớp) |
| DELETE | `/api/mobile/staff/classes/:classId/grade-books/:id` | Staff | Staff (GV/Quản lý lớp) |
| GET | `/api/mobile/staff/invoices` | Staff khác | Staff (mọi phòng ban) |
| GET | `/api/mobile/staff/assignments` | Staff khác | Staff (Phòng Đào tạo) |
| POST | `/api/mobile/staff/assignments/grade` | Staff khác | Staff (Phòng Đào tạo) |
| GET | `/api/mobile/learning-overview/summary` | Staff khác | Staff |
| GET | `/api/mobile/students-ending-soon` | Staff khác | Staff |
| GET | `/api/student-sessions/:id/review` | Chung | Đã đăng nhập |

---

## Quy tắc phân quyền

| Điều kiện | Yêu cầu |
|---|---|
| **Student / Parent** | `student.userId = user.id`. Parent có `student.type = "Phụ huynh"` → tự động nhận data của tất cả con. |
| **Staff** | `staff.userId = user.id` |
| **Staff GV/Quản lý lớp** | Staff phải có tên trong `class.teacherIds` hoặc `class.managerIds` **VÀ** có `staff_assignments.locationId = class.locationId` |
| **Phòng Đào tạo** | Staff phải thuộc phòng ban hệ thống tên `"Phòng Đào tạo"` (`departments.isSystem = true`) |
| **Super Admin** | `user.username = "admin"` → bỏ qua mọi filter cơ sở, xem toàn bộ dữ liệu |
