# EduManage — Mobile API Documentation

**Base URL:** `https://<domain>/api/mobile`  
**Auth:** JWT Bearer Token (trừ các endpoint PUBLIC)  
**Header:** `Authorization: Bearer <token>`  
**JWT TTL:** 30 ngày  
**Content-Type:** `application/json`

---

## Mục lục

1. [Auth](#1-auth)
2. [Lịch học — Chung](#2-lịch-học--chung)
3. [Học viên — Lịch](#3-học-viên--lịch)
4. [Học viên — Bài tập & Kiểm tra](#4-học-viên--bài-tập--kiểm-tra)
5. [Học viên — Tài chính](#5-học-viên--tài-chính)
6. [Học viên — Bảng điểm](#6-học-viên--bảng-điểm)
7. [Học viên — Thông báo](#7-học-viên--thông-báo)
8. [Phụ huynh](#8-phụ-huynh)
9. [Học online](#9-học-online)
10. [Nhân viên — Lịch dạy & Nội dung](#10-nhân-viên--lịch-dạy)
11. [Nhân viên — Bài tập (Phòng Đào tạo)](#11-nhân-viên--bài-tập-phòng-đào-tạo)
12. [Nhân viên — Bảng điểm](#12-nhân-viên--bảng-điểm)
13. [Nhân viên — Tài chính (Lương)](#13-nhân-viên--tài-chính-lương)
14. [Nhân viên — Bảng lương đứng lớp (Payroll)](#14-nhân-viên--bảng-lương-đứng-lớp-payroll)
15. [Nhân viên — Học viên sắp hết lịch](#15-nhân-viên--học-viên-sắp-hết-lịch)
16. [Buổi kiểm tra (Test Session)](#16-buổi-kiểm-tra-test-session)
17. [Nhận xét (Review)](#17-nhận-xét-review)
18. [Deeplink / Screen Routing](#18-deeplink--screen-routing)
19. [Enum & Giá trị tham chiếu](#19-enum--giá-trị-tham-chiếu)
20. [Nhân viên — Công việc (Tasks)](#20-nhân-viên--công-việc-tasks)
21. [Nhân viên — Thông báo](#21-nhân-viên--thông-báo)
22. [Chat (Tinode)](#22-chat-tinode) — 22.1 Kết nối · 22.2 Lưu UID · 22.3 Danh sách nhóm · 22.4 Chi tiết kênh lớp · 22.5 Tra tên · 22.6 Tìm user · 22.7 Chat cá nhân · 22.8 Tạo nhóm · 22.9 Xoá nhóm · 22.10 Thêm thành viên · 22.11 Chi tiết nhóm tạo tay · 22.12 Đổi tên nhóm · 22.13 Xoá thành viên/Rời nhóm · 22.14 Tìm lớp để tạo nhóm · 22.15 Thành viên lớp
23. [Bảng tin (News Feed)](#23-bảng-tin-news-feed)
24. [Push Notification Token](#24-push-notification-token)
25. [Dashboard Tổng quan (Staff/Admin)](#25-dashboard-tổng-quan-staffadmin) — 25.1 Tab Khách hàng · 25.2 Tab Đào tạo · 25.3 Tab Tài chính

---

## 1. Auth

### 1.1 Đăng nhập Zalo Mini App
```
POST /api/mobile/auth/zalo
```
**PUBLIC — không cần token**

**Body:**
```json
{ "accessToken": "zalo_access_token_from_zmp_sdk" }
```

**Response 200:**
```json
{
  "token": "<JWT>",
  "center": "https://center-domain.com",
  "needsOnboarding": false,
  "userType": "student",
  "studentId": "uuid",
  "fullName": "Nguyễn Văn A"
}
```

| `userType` | Mô tả |
|---|---|
| `"student"` | Học viên |
| `"parent"` | Phụ huynh |
| `"staff"` | Nhân viên / Giáo viên |
| `null` | Chưa liên kết |

Khi `needsOnboarding = true`: tài khoản Zalo chưa được liên kết, app cần hiển thị màn hình nhập SĐT/mã học viên để liên kết.

---

### 1.2 Đăng nhập Username/Password
```
POST /api/mobile/auth/login
```
**PUBLIC**

**Body:**
```json
{
  "username": "student01",
  "password": "password123"
}
```

**Response 200:**
```json
{
  "token": "<JWT>",
  "center": "https://center-domain.com",
  "needsOnboarding": false,
  "user": { "id": "uuid", "username": "student01", "isActive": true },
  "userType": "student",
  "profile": { "id": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001" }
}
```

---

## 2. Lịch học — Chung

### 2.1 Lịch hôm nay
```
GET /api/mobile/schedule/today
```
Tự động xác định loại tài khoản (học viên / nhân viên) và trả lịch phù hợp.

**Response — Học viên:**
```json
{
  "userType": "student",
  "date": "2026-06-30",
  "sessions": [
    {
      "classSessionId": "uuid",
      "studentSessionId": "uuid",
      "sessionDate": "2026-06-30",
      "sessionIndex": 5,
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "locationName": "Cơ sở 1",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "sessionStatus": "scheduled",
      "teacherNames": ["Nguyễn Thị B"],
      "attendanceStatus": "pending",
      "attendanceNote": null
    }
  ]
}
```

**Response — Nhân viên:**
```json
{
  "userType": "staff",
  "date": "2026-06-30",
  "sessions": [
    {
      "classSessionId": "uuid",
      "sessionDate": "2026-06-30",
      "sessionIndex": 5,
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "locationName": "Cơ sở 1",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "sessionStatus": "scheduled",
      "enrolledCount": 20,
      "pendingCount": 3
    }
  ]
}
```

---

## 3. Học viên — Lịch

> **Hai bộ API song song:**
> | Bộ | Prefix | Auth | Dùng cho |
> |---|---|---|---|
> | Mobile | `/api/mobile/student/...` | JWT Bearer | App mobile / Zalo Mini App |
> | Web | `/api/my-space/calendar/student/...` | Session cookie | Web client trang `/my-space/calendar` |
>
> Cả hai đều hỗ trợ **Phụ huynh** — tự động trả dữ liệu của tất cả con liên kết.  
> Lỗi chung: `401` (thiếu/sai auth) · `403` (không phải học viên) · `500` (lỗi server)

---

### ── MOBILE API (JWT Bearer) ──

### 3.1 Lịch tháng (danh sách đầy đủ)
```
GET /api/mobile/student/calendar?month=YYYY-MM
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | YYYY-MM. Mặc định tháng hiện tại |

**Response:**
```json
{
  "month": "2026-06",
  "datesWithSessions": ["2026-06-02T00:00:00.000Z", "2026-06-09T00:00:00.000Z"],
  "sessions": [
    {
      "classSessionId": "uuid",
      "studentSessionId": "uuid",
      "sessionDate": "2026-06-02T00:00:00.000Z",
      "sessionIndex": 1,
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "onlineLink": null,
      "locationId": "uuid",
      "locationName": "Cơ sở 1",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "sessionStatus": "scheduled",
      "teacherNames": ["Nguyễn Thị B"],
      "attendanceStatus": "present",
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    }
  ]
}
```

> **Lưu ý:** Bao gồm cả buổi kiểm tra tập trung (`isTestSession: true`, `classCode: "TEST"`).

---

### 3.2 Danh sách ngày có buổi học (chấm tròn)
```
GET /api/mobile/student/calendar/month?month=YYYY-MM
```
Trả nhẹ hơn, chỉ lấy danh sách ngày — dùng để vẽ chấm trên lịch.

**Response:**
```json
{
  "month": "2026-06",
  "datesWithSessions": ["2026-06-02T00:00:00.000Z", "2026-06-09T00:00:00.000Z"]
}
```

---

### 3.3 Chi tiết buổi học trong ngày
```
GET /api/mobile/student/calendar/day?date=YYYY-MM-DD
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `date` | Không | YYYY-MM-DD. Mặc định hôm nay |

**Response:**
```json
{
  "date": "2026-06-30T00:00:00.000Z",
  "sessions": [
    {
      "classSessionId": "uuid",
      "studentSessionId": "uuid",
      "sessionDate": "2026-06-30T00:00:00.000Z",
      "sessionIndex": 5,
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "onlineLink": "https://meet.google.com/xxx",
      "locationId": "uuid",
      "locationName": "Cơ sở 1",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "online",
      "sessionStatus": "scheduled",
      "teacherNames": ["Nguyễn Thị B"],
      "attendanceStatus": "present",
      "attendanceNote": null,
      "reviewPublished": true,
      "reviewData": [
        {
          "teacherName": "Nguyễn Thị B",
          "criteria": [
            {
              "criteriaName": "Thái độ học tập",
              "rating": 4,
              "items": [{ "subCriteriaName": "Tập trung", "comment": "Tốt" }]
            }
          ]
        }
      ],
      "generalContents": [
        {
          "id": "uuid",
          "type": "homework",
          "title": "Bài 3 trang 45",
          "description": null,
          "resourceUrl": null,
          "attachments": [{ "name": "De bai.pdf", "url": "https://..." }]
        }
      ],
      "personalContents": [],
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false,
      "enrolledCount": 20,
      "onlineClickedAt": null,
      "onlineEndedAt": null
    }
  ]
}
```

---

### 3.4 Chi tiết một buổi học theo ID
```
GET /api/mobile/student/session/:classSessionId?studentId=uuid
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `classSessionId` | Có | Path param — UUID buổi học |
| `studentId` | Không | Query — Phụ huynh có thể chỉ định con cụ thể |

**Response:** Tương tự session trong `calendar/day`, thêm `onlineRule`:
```json
{
  "onlineRule": {
    "earlyEntryMinutes": 15,
    "lateEntryMinutes": 30,
    "earlyEndMinutes": 10
  }
}
```

---

### 3.5 Ghi nhận bắt đầu học online
```
POST /api/mobile/student/session/:classSessionId/online-click?studentId=uuid
```
**Response:**
```json
{ "onlineClickedAt": "2026-06-30T08:02:00.000Z" }
```

---

### 3.6 Ghi nhận kết thúc học online
```
POST /api/mobile/student/session/:classSessionId/online-end?studentId=uuid
```
**Response:**
```json
{ "onlineEndedAt": "2026-06-30T10:05:00.000Z" }
```

---

### ── WEB API (Session Cookie) ──

### 3.7 Lịch tháng — Web
```
GET /api/my-space/calendar/student?month=YYYY-MM
```
**Auth:** Session cookie  

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | YYYY-MM. Mặc định tháng hiện tại |

**Response 200:**
```json
{
  "month": "2026-06",
  "datesWithSessions": ["2026-06-02", "2026-06-09"],
  "sessions": [
    {
      "classSessionId": "uuid",
      "studentSessionId": "uuid",
      "classId": "uuid",
      "sessionDate": "2026-06-02",
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "onlineLink": null,
      "locationId": "uuid",
      "locationName": "Cơ sở 1",
      "teacherNames": ["Nguyễn Thị B"],
      "enrolledCount": 20,
      "sessionStatus": "scheduled",
      "attendanceStatus": "present",
      "studentId": "uuid",
      "studentName": null,
      "studentCode": null
    }
  ]
}
```

> `studentName` / `studentCode` chỉ có giá trị khi tài khoản là phụ huynh (isParent). Học viên thường sẽ là `null`.  
> Bao gồm buổi kiểm tra tập trung (`isTestSession: true`, `classCode: "TEST"`).  
> Web API tự loại bỏ trùng lặp (dedup) theo `(studentId, classSessionId)` — Mobile API không có bước này.  
> **Khác biệt vs Mobile 3.1:** `sessionDate` là `YYYY-MM-DD` thuần (không có `T00:00:00.000Z`), không có field `student` object, thêm `classId`.

---

### 3.8 Danh sách tất cả buổi học, nhóm theo lớp — Web
```
GET /api/my-space/calendar/student/list
```
**Auth:** Session cookie  
Trả toàn bộ lịch sử (không giới hạn tháng), nhóm theo lớp. Không có query param.

**Response 200:**
```json
[
  {
    "classId": "uuid",
    "className": "Toán 9A",
    "classCode": "T9A-001",
    "sessions": [
      {
        "classSessionId": "uuid",
        "sessionIndex": 1,
        "sessionDate": "2026-06-02",
        "startTime": "08:00",
        "endTime": "10:00",
        "attendanceStatus": "present",
        "attendanceNote": null
      }
    ]
  }
]
```

> **Không có mobile equivalent.** Dùng để xem toàn bộ lịch sử điểm danh theo từng lớp.

---

### 3.9 Danh sách lớp (metadata nhẹ) — Web
```
GET /api/my-space/calendar/student/classes
```
**Auth:** Session cookie  
Trả danh sách các lớp học viên tham gia + tổng số buổi. Không có query param.

**Response 200:**
```json
[
  {
    "classId": "uuid",
    "className": "Toán 9A",
    "classCode": "T9A-001",
    "totalSessions": 24
  }
]
```

> **Không có mobile equivalent.** Dùng để render danh sách lớp, sau đó gọi 3.10 để load buổi từng lớp.

---

### 3.10 Buổi học theo lớp (phân trang) — Web
```
GET /api/my-space/calendar/student/class/:classId/sessions
```
**Auth:** Session cookie  

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `classId` | Có (path) | UUID lớp học |
| `page` | Không | Trang. Mặc định 1 |
| `pageSize` | Không | Mặc định 20, tối đa 50 |

**Response 200:**
```json
{
  "sessions": [
    {
      "classSessionId": "uuid",
      "sessionIndex": 1,
      "sessionDate": "2026-06-02",
      "startTime": "08:00",
      "endTime": "10:00",
      "attendanceStatus": "present",
      "attendanceNote": null,
      "reviewPublished": true
    }
  ],
  "total": 24,
  "page": 1,
  "pageSize": 20,
  "totalPages": 2
}
```

> **Không có mobile equivalent.** Dùng kết hợp với 3.9 để render lịch sử điểm danh phân trang theo lớp.

---

### 3.11 Chi tiết một buổi học — Web
```
GET /api/my-space/calendar/student/session/:classSessionId?studentId=uuid
```
**Auth:** Session cookie  

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `classSessionId` | Có (path) | UUID buổi học hoặc test session |
| `studentId` | Không | Phụ huynh chỉ định con cụ thể |

**Response 200:**
```json
{
  "classSessionId": "uuid",
  "studentSessionId": "uuid",
  "sessionDate": "2026-06-30",
  "weekday": 1,
  "className": "Toán 9A",
  "classCode": "T9A-001",
  "startTime": "08:00",
  "endTime": "10:00",
  "learningFormat": "online",
  "onlineLink": "https://meet.google.com/xxx",
  "locationId": "uuid",
  "locationName": "Cơ sở 1",
  "sessionStatus": "scheduled",
  "teacherNames": ["Nguyễn Thị B"],
  "attendanceStatus": "present",
  "attendanceNote": null,
  "reviewPublished": true,
  "reviewData": [
    {
      "teacherName": "Nguyễn Thị B",
      "criteria": [
        {
          "criteriaName": "Thái độ học tập",
          "rating": 4,
          "items": [{ "subCriteriaName": "Tập trung", "comment": "Tốt" }]
        }
      ]
    }
  ],
  "generalContents": [
    {
      "id": "uuid",
      "type": "Bài tập về nhà",
      "title": "Bài 3 trang 45",
      "description": null,
      "resourceUrl": null,
      "availableAt": null,
      "maxAttempts": null
    }
  ],
  "personalContents": [],
  "userType": "student",
  "studentName": null,
  "studentCode": null,
  "enrolledCount": 20,
  "onlineClickedAt": null,
  "onlineEndedAt": null
}
```

> Hỗ trợ cả **buổi kiểm tra tập trung** (`test_sessions`) — fallback tự động nếu `classSessionId` không tìm thấy trong `class_sessions`.  
> `studentName` / `studentCode` chỉ trả khi tài khoản là phụ huynh.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `404` | Buổi học không tồn tại hoặc học viên không có quyền xem |

---

### 3.12 Ghi nhận bắt đầu học online — Web
```
POST /api/my-space/calendar/student/session/:classSessionId/online-click
```
**Auth:** Session cookie  
**Body:** rỗng (không cần)

**Response 200:**
```json
{ "onlineClickedAt": "2026-06-30T08:02:00.000Z" }
```

---

### 3.13 Ghi nhận kết thúc học online — Web
```
POST /api/my-space/calendar/student/session/:classSessionId/online-end
```
**Auth:** Session cookie  
**Body:** rỗng (không cần)

**Response 200:**
```json
{ "onlineEndedAt": "2026-06-30T10:05:00.000Z" }
```

---

**So sánh Mobile vs Web calendar:**

| Tính năng | Mobile (JWT) | Web (Session) |
|---|---|---|
| Lịch tháng + sessions | 3.1 `/calendar` | 3.7 `/calendar/student` |
| Chỉ lấy ngày có buổi (dots) | 3.2 `/calendar/month` | — (dùng `datesWithSessions` từ 3.7) |
| Chi tiết ngày | 3.3 `/calendar/day` | — (gọi 3.11 từng session) |
| Chi tiết buổi theo ID | 3.4 `/session/:id` | 3.11 `/session/:id` |
| Online click | 3.5 | 3.12 |
| Online end | 3.6 | 3.13 |
| Tất cả buổi nhóm theo lớp | ❌ chưa có | 3.8 `/list` |
| Danh sách lớp (metadata) | ❌ chưa có | 3.9 `/classes` |
| Buổi theo lớp phân trang | ❌ chưa có | 3.10 `/class/:id/sessions` |
| Field `student` object | ✅ `{id, name, code}` | ❌ — dùng `studentName`/`studentCode` riêng |
| Field `classId` | ❌ | ✅ |
| Dedup trùng lặp | ❌ | ✅ |
| `onlineRule` trong session detail | ✅ (3.4) | ❌ |

---

## 4. Học viên — Bài tập & Kiểm tra

### 4.1 Danh sách bài tập
```
GET /api/mobile/student/assignments
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | YYYY-MM. Mặc định tháng hiện tại |
| `dateFrom` | Không | YYYY-MM-DD — Dùng kết hợp với `dateTo` thay cho `month` |
| `dateTo` | Không | YYYY-MM-DD |
| `status` | Không | `"submitted"` \| `"pending"` \| `"all"` |
| `itemType` | Không | `"BTVN"` \| `"exam"` \| `"all"` |
| `className` | Không | Tên lớp (không phân biệt hoa/thường) |
| `page` | Không | Trang. Mặc định 1 |
| `pageSize` | Không | Số dòng mỗi trang. Mặc định 50, tối đa 100 |

> **Lưu ý `itemType`:** Khi truyền `itemType=exam`, response trả `itemType: "Bài kiểm tra"` (tiếng Việt). Khi truyền `itemType=BTVN`, response trả `itemType: "BTVN"`.

**Response:**
```json
{
  "month": "2026-06",
  "rows": [
    {
      "itemType": "BTVN",
      "classSessionId": "uuid",
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "sessionDate": "2026-06-02T00:00:00.000Z",
      "weekday": 1,
      "sessionIndex": 1,
      "startTime": "08:00",
      "endTime": "10:00",
      "homeworkId": "uuid",
      "title": "Bài 3 trang 45",
      "description": null,
      "attachments": [{ "name": "De bai.pdf", "url": "https://..." }],
      "isPersonalized": false,
      "submissionStatus": "pending",
      "submissionContent": null,
      "submissionAttachments": [{ "name": "Bài làm.pdf", "url": "https://..." }],
      "studentSessionContentId": "uuid",
      "score": null,
      "comment": null,
      "dueDate": "2026-06-09T00:00:00.000Z",
      "examId": null,
      "maxAttempts": null,
      "attemptsUsed": null,
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    },
    {
      "itemType": "Bài kiểm tra",
      "classSessionId": "uuid",
      "classId": "uuid",
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "sessionDate": "2026-06-10T00:00:00.000Z",
      "weekday": 3,
      "sessionIndex": 5,
      "startTime": "08:00",
      "endTime": "10:00",
      "homeworkId": "uuid",
      "title": "Kiểm tra 15 phút",
      "description": null,
      "attachments": [],
      "isPersonalized": false,
      "submissionStatus": "submitted",
      "submissionContent": null,
      "submissionAttachments": [],
      "studentSessionContentId": null,
      "score": "8.5",
      "comment": "Tốt",
      "submittedAt": "2026-06-10T09:30:00.000Z",
      "dueDate": null,
      "examId": "exam-uuid",
      "maxAttempts": 2,
      "attemptsUsed": 1,
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    }
  ],
  "total": 12,
  "page": 1,
  "pageSize": 50,
  "totalPages": 1
}
```

**Khác nhau giữa BTVN và Bài kiểm tra:**

| Field | BTVN | Bài kiểm tra |
|---|---|---|
| `classId` | không có | có |
| `submittedAt` | không có | ISO string hoặc `null` |
| `dueDate` | ISO string hoặc `null` | luôn `null` |
| `studentSessionContentId` | uuid hoặc `null` | luôn `null` |
| `attachments` | file đề bài | luôn `[]` |
| `submissionAttachments` | `[{name, url}]` — file nộp | luôn `[]` |

> **`submissionAttachments`** — server trả về mảng object `[{ name, url }]`, **không phải** mảng string thô.  
> **Phụ huynh:** field `student` chứa thông tin con học viên sở hữu bài tập đó.

---

### 4.2 Nộp bài tập
```
POST /api/mobile/student/assignments/submit
```

**Body:**
```json
{
  "homeworkId": "uuid",
  "submissionContent": "Nội dung bài làm...",
  "submissionAttachments": ["Tên file||https://url-file", "Bài làm.pdf||https://..."]
}
```

> **Định dạng `submissionAttachments` khi GỬI LÊN:** `"Tên hiển thị||URL"` — dùng `||` làm phân cách.  
> Server sẽ parse và lưu, khi GET trả về sẽ là `[{ name, url }]` đã được parse sẵn.

**Response:**
```json
{ "success": true }
```

---

### 4.3 Kiểm tra số lần làm bài kiểm tra
```
GET /api/mobile/student/exam/:examId/attempt-count?studentId=uuid&classId=uuid
```

**Response:**
```json
{ "count": 1, "maxAttempts": 2 }
```

---

### 4.4 Lấy metadata bài kiểm tra
```
GET /api/exams/:examId
```
> Endpoint **chung** (không có prefix `/mobile/`). Dùng để hiển thị tên đề, thời gian, số lần làm tối đa trước khi vào thi.

**Response:**
```json
{
  "id": "exam-uuid",
  "code": "KT-001",
  "name": "Kiểm tra giữa kỳ",
  "description": "Đề kiểm tra 45 phút",
  "status": "published",
  "locationId": "uuid",
  "timeLimitMinutes": 45,
  "maxAttempts": 2,
  "passingScore": "5.00",
  "showResult": true,
  "openAt": "2026-06-10T01:00:00.000Z",
  "closeAt": "2026-06-10T03:00:00.000Z",
  "createdBy": "uuid",
  "updatedBy": "uuid",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "createdByName": "Nguyễn Thị B",
  "updatedByName": "Nguyễn Thị B"
}
```

| Field | Mô tả |
|---|---|
| `timeLimitMinutes` | Giới hạn thời gian (phút). `null` = không giới hạn |
| `maxAttempts` | Số lần làm tối đa. `null` / `1` = chỉ 1 lần |
| `passingScore` | Điểm qua môn. `null` = không áp dụng |
| `showResult` | `true` = hiển thị kết quả ngay sau khi nộp |
| `openAt` / `closeAt` | Khung giờ mở/đóng đề. `null` = không giới hạn thời gian |

---

### 4.5 Bắt đầu phiên làm bài (kích hoạt bộ đếm thời gian)
```
POST /api/exams/:examId/start-session
```
> Endpoint **chung**. Gọi ngay khi học viên bấm "Bắt đầu làm bài". Server lưu thời điểm bắt đầu vào DB — an toàn khi pod restart hay multi-instance.

**Body:** (không cần)

**Response:**
```json
{
  "startedAt": "2026-06-10T08:00:00.000Z",
  "expiresAt": "2026-06-10T08:45:00.000Z"
}
```
> `expiresAt` = `null` nếu bài không có giới hạn thời gian.  
> Server thêm 60 giây grace period khi validate lúc nộp bài.

---

### 4.6 Lấy đề thi (câu hỏi)
```
GET /api/exams/:examId/preview
```
> Endpoint **chung**. Trả danh sách section kèm câu hỏi, đã được enrich thêm thông tin cho mobile.

**Response:** `ExamSection[]`
```json
[
  {
    "id": "section-uuid",
    "examId": "exam-uuid",
    "name": "Part 1 - Listening",
    "type": "listening",
    "orderIndex": 0,
    "readingPassageUrl": null,
    "readingPassageName": null,
    "sessionAudioUrl": "https://.../audio.mp3",
    "sessionAudioName": "audio.mp3",
    "aiGradingEnabled": false,
    "passageInfo": null,
    "audioInfo": { "url": "https://.../audio.mp3", "name": "audio.mp3" },
    "questions": [
      {
        "id": "esq-uuid",
        "sectionId": "section-uuid",
        "questionId": "q-uuid",
        "orderIndex": 0,
        "question": {
          "id": "q-uuid",
          "type": "single_choice",
          "title": null,
          "content": "Câu 1: Chọn đáp án đúng...",
          "mediaImageUrl": null,
          "mediaAudioUrl": null,
          "options": [
            { "id": "A", "text": "Đáp án A" },
            { "id": "B", "text": "Đáp án B" },
            { "id": "C", "text": "Đáp án C" }
          ],
          "correctAnswer": "A",
          "score": "1.00",
          "difficulty": "medium",
          "explanation": null
        }
      }
    ]
  }
]
```

**Loại câu hỏi (`question.type`) và dữ liệu đặc thù:**

| `type` | `options` | Field bổ sung | Định dạng answer khi nộp |
|---|---|---|---|
| `single_choice` | `[{id, text}]` | — | `"A"` (string) |
| `multiple_choice` | `[{id, text}]` | — | `["A","C"]` (string[]) |
| `fill_blank` | `null` | `contentParts` | `{"1": "Paris", "2": "London"}` |
| `essay` | `null` | — | `"Nội dung bài làm..."` (string) |
| `matching` | — | `matchingData` | `{"left-id": "right-id"}` |

**`contentParts`** (chỉ có ở `fill_blank`) — mảng parse từ `content`, dùng để render câu hỏi điền từ:
```json
"contentParts": [
  { "type": "text", "text": "Thủ đô của Pháp là " },
  { "type": "blank", "blankId": "1", "index": 0 },
  { "type": "text", "text": " và thủ đô của Anh là " },
  { "type": "blank", "blankId": "2", "index": 1 }
]
```

**`matchingData`** (chỉ có ở `matching`) — dữ liệu ghép đôi:
```json
"matchingData": {
  "leftItems":  [{ "id": "pair-uuid-1", "text": "Dog" }],
  "rightItems": [{ "id": "pair-uuid-2", "text": "Chat" }],
  "scorePerPair": 1,
  "shuffleB": true,
  "correctPairs": [
    { "leftId": "pair-uuid-1", "rightId": "pair-uuid-1", "leftText": "Dog", "rightText": "Con chó" }
  ]
}
```
> `rightItems` đã được shuffle theo `shuffleB`. Đáp án đúng: `answers[leftItemId] === leftItemId` (vì `leftId === rightId` trong cùng pair).

**`passageInfo`** (chỉ có ở section loại `reading`) — thông tin đoạn văn:
```json
"passageInfo": { "url": "https://.../passage.pdf", "name": "Reading Passage 1" }
```

---

### 4.7 Nộp bài kiểm tra
```
POST /api/exam-submissions
```
> Endpoint **chung**. Server tự xác định `studentId` từ JWT — không cần truyền trong body.

**Body:**
```json
{
  "examId": "exam-uuid",
  "classId": "class-uuid",
  "homeworkId": "session-content-uuid",
  "answers": {
    "q-uuid-1": "A",
    "q-uuid-2": ["A", "C"],
    "q-uuid-3": { "1": "Paris", "2": "London" },
    "q-uuid-4": { "left-id-1": "left-id-1" }
  },
  "timeTakenSeconds": 1200,
  "submittedAt": "2026-06-10T08:20:00.000Z"
}
```

| Field | Bắt buộc | Mô tả |
|---|---|---|
| `examId` | Có | UUID bài kiểm tra |
| `classId` | Không | UUID lớp — nên truyền để gắn điểm đúng lớp |
| `homeworkId` | Không | UUID session_content — liên kết bài nộp vào buổi học cụ thể |
| `answers` | Có | Map `questionId → answer` — xem bảng type ở 4.6 |
| `timeTakenSeconds` | Không | Thời gian làm bài (giây) |
| `submittedAt` | Không | Mặc định giờ server |

**Response 201:**
```json
{
  "id": "submission-uuid",
  "examId": "exam-uuid",
  "studentId": "student-uuid",
  "studentName": "Nguyễn Văn A",
  "studentCode": "HV001",
  "classId": "class-uuid",
  "answers": { ... },
  "score": "8.50",
  "adjustedScore": "8.50",
  "comment": null,
  "partScores": [
    { "partName": "Part 1", "correct": 4, "total": 5, "score": 4.0 }
  ],
  "timeTakenSeconds": 1200,
  "submittedAt": "2026-06-10T08:20:00.000Z",
  "createdAt": "2026-06-10T08:20:01.000Z"
}
```

**Lỗi đặc biệt:**

| HTTP | Tình huống |
|---|---|
| `429` | Nộp lại trong vòng 5 giây |
| `409` | Request trùng đang được xử lý (double-submit) |
| `422` | Thời gian làm bài đã hết (vượt `expiresAt` + 60s grace) |

---

## 5. Học viên — Tài chính

> **Hai API cho cùng dữ liệu hoá đơn:**
> | API | Endpoint | Auth | Dùng cho |
> |---|---|---|---|
> | Mobile | `GET /api/mobile/student/invoices` | JWT Bearer | App mobile / Zalo Mini App |
> | Web | `GET /api/my-space/invoices` | Session cookie | Web client trang `/my-space/invoices` |

---

### 5.1 Danh sách hoá đơn — Mobile (JWT)
```
GET /api/mobile/student/invoices
```
**Auth:** JWT Bearer token  
**Hỗ trợ Phụ huynh** — trả hoá đơn của tất cả con liên kết. **Không có query param** — trả toàn bộ lịch sử, sắp xếp theo `createdAt` mới nhất trước.

**Response 200:**
```json
{
  "invoices": [
    {
      "id": "schedule-uuid",
      "invoiceId": "invoice-uuid",
      "title": "Học phí lớp Toán 9A",
      "code": "HD-001-D1",
      "label": "Đợt 1",
      "type": "Thu",
      "category": "Học phí",
      "amount": "2000000",
      "paidAmount": null,
      "remainingAmount": null,
      "status": "unpaid",
      "dueDate": "2026-06-15T00:00:00.000Z",
      "paidAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "isSchedule": true,
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    },
    {
      "id": "invoice-uuid",
      "invoiceId": "invoice-uuid",
      "title": "Học phí lớp Toán 9A",
      "code": "HD-002",
      "label": null,
      "type": "Thu",
      "category": "Học phí",
      "amount": "5000000",
      "paidAmount": "3000000",
      "remainingAmount": "2000000",
      "status": "partial",
      "dueDate": "2026-06-30T00:00:00.000Z",
      "paidAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "isSchedule": false,
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    }
  ],
  "summary": {
    "totalPaid": 2000000,
    "totalUnpaid": 4000000,
    "totalAmount": 6000000
  },
  "isParent": false
}
```

**Hai chế độ hiển thị theo `isSchedule`:**

| Field | `isSchedule: true` (có lịch trả góp) | `isSchedule: false` (hoá đơn thẳng) |
|---|---|---|
| `id` | UUID của **đợt thanh toán** | UUID của hoá đơn |
| `invoiceId` | UUID của hoá đơn gốc | UUID của hoá đơn (= `id`) |
| `code` | Mã đợt thanh toán | Mã hoá đơn |
| `label` | Tên đợt (vd: "Đợt 1") | `null` |
| `amount` | Số tiền đợt đó | Tổng hoá đơn (`grandTotal`) |
| `paidAmount` | luôn `null` | Số đã thanh toán |
| `remainingAmount` | luôn `null` | Số còn lại |
| `paidAt` | ISO timestamp nếu đợt đã trả, `null` nếu chưa | luôn `null` |
| `status` | Status của đợt thanh toán | Status của hoá đơn |
| `student` | `{id, name, code}` | `{id, name, code}` |
| `isParent` | `true` nếu token là phụ huynh | `true` nếu token là phụ huynh |

> **`title`** — server tạo theo thứ tự: `description` → `className` → `classCode` → `"Hoá đơn"`.  
> **`summary`** — server tính sẵn; `totalUnpaid` dùng `remainingAmount` (nếu có) hoặc `amount` cho status `unpaid`, `debt`, `partial`.  
> **Sắp xếp** — `createdAt` DESC (mới nhất trước). Nếu cùng hoá đơn có nhiều đợt, thứ tự đợt theo `sortOrder` của lịch trả góp.

**`status` — giá trị hợp lệ:**

| Giá trị | Mô tả |
|---|---|
| `"unpaid"` | Chưa thanh toán |
| `"partial"` | Thanh toán một phần |
| `"paid"` | Đã thanh toán đủ |
| `"debt"` | Nợ |
| `"cancelled"` | Đã huỷ |

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Thiếu hoặc sai JWT Bearer token |
| `403` | Tài khoản không phải học viên / phụ huynh |
| `500` | Lỗi server |

---

### 5.2 Danh sách hoá đơn — Web (Session)
```
GET /api/my-space/invoices
```
**Auth:** Session cookie (đăng nhập web)  
**Tương đương** trang `/my-space/invoices` trên web client. Hỗ trợ ba loại tài khoản khác nhau — server tự phân loại theo user đang đăng nhập.

**Không có query param** — trả toàn bộ lịch sử, sắp xếp theo `createdAt` mới nhất trước.

#### Chế độ Học viên / Phụ huynh

Học viên cần được cấp quyền `canView` cho resource `/my-space/invoices` trong role hệ thống tương ứng. Phụ huynh thì trả hoá đơn của tất cả con liên kết.

**Response 200:**
```json
{
  "invoices": [
    {
      "id": "schedule-uuid",
      "invoiceId": "invoice-uuid",
      "title": "Học phí lớp Toán 9A",
      "code": "HD-001-D1",
      "label": "Đợt 1",
      "studentName": "Nguyễn Văn A",
      "type": "Thu",
      "category": "Học phí",
      "amount": "2000000",
      "status": "unpaid",
      "dueDate": "2026-06-15",
      "paidAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "isSchedule": true
    },
    {
      "id": "invoice-uuid",
      "invoiceId": "invoice-uuid",
      "title": "Học phí lớp Toán 9A",
      "code": "HD-002",
      "label": null,
      "studentName": "Nguyễn Văn A",
      "type": "Thu",
      "category": "Học phí",
      "amount": "5000000",
      "status": "partial",
      "dueDate": "2026-06-30",
      "paidAt": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "isSchedule": false
    }
  ]
}
```

#### Chế độ Nhân viên (Staff)

Khi user là nhân viên, endpoint trả về **phiếu chi lương** — hoá đơn loại `Chi` liên quan đến mã nhân viên hoặc bảng lương đã publish.

**Response 200:**
```json
{
  "invoices": [
    {
      "id": "invoice-uuid",
      "invoiceId": "invoice-uuid",
      "title": "Lương tháng 6/2026",
      "code": "PC-2026-06-001",
      "label": null,
      "studentName": "Trần Thị B",
      "type": "Chi",
      "category": "Lương",
      "amount": "8000000",
      "status": "paid",
      "dueDate": "2026-06-30",
      "paidAt": "2026-06-28T00:00:00.000Z",
      "createdAt": "2026-06-25T00:00:00.000Z",
      "isSchedule": false
    }
  ]
}
```

**So sánh Web API vs Mobile API:**

| Field | Mobile (`/api/mobile/student/invoices`) | Web (`/api/my-space/invoices`) |
|---|---|---|
| Auth | JWT Bearer | Session cookie |
| `student` | Object `{id, name, code}` | Không có — dùng `studentName` (string) |
| `studentName` | Không có | String — tên học viên |
| `paidAmount` | Có (nếu `isSchedule: false`) | **Không có** |
| `remainingAmount` | Có (nếu `isSchedule: false`) | **Không có** |
| `summary` | Có (`totalPaid`, `totalUnpaid`, `totalAmount`) | **Không có** |
| `isParent` | Có (top-level và mỗi item) | **Không có** |
| `dueDate` / `createdAt` | Luôn ISO 8601 string | Raw DB value (có thể là `YYYY-MM-DD` string) |
| Staff mode | Không hỗ trợ | Có — trả phiếu chi lương |
| Permission check | Không (chỉ cần là student/parent) | Có — học viên cần quyền `canView` |

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Chưa đăng nhập (no session) |
| `403` | Học viên không có quyền xem hoá đơn (`canView = false`) |
| `500` | Lỗi server |

---

### 5.3 Tổng số sao — Mobile (JWT)
```
GET /api/mobile/student/stars
```
**Auth:** JWT Bearer token  
**Hỗ trợ Phụ huynh** — trả tổng hợp sao của tất cả con và breakdown từng con.  
**Không có query param** — trả toàn bộ lịch sử (tối đa 100 giao dịch gần nhất).

> **Nguồn sao:**
> - **Tích sao** — giáo viên chấm `criteriaRatings` trong review buổi học (`student_sessions.review_data`). Không có bản ghi giao dịch riêng — chỉ phản ánh qua `earned`.
> - **Tiêu sao** — khi học viên đổi quà/mua hàng tại cửa hàng, ghi vào bảng `student_star_transactions` với `delta < 0`.

**Response 200:**
```json
{
  "earned": 42,
  "spent": 10,
  "available": 32,
  "isParent": false,
  "students": [],
  "transactions": [
    {
      "id": "uuid",
      "studentId": "uuid",
      "studentName": "Nguyễn Văn A",
      "delta": -5,
      "reason": "Xuất kho PXK-001",
      "receiptId": "uuid",
      "receiptCode": "PXK-001",
      "createdAt": "2026-06-20T10:00:00.000Z"
    }
  ]
}
```

**Giải thích các field:**

| Field | Kiểu | Mô tả |
|---|---|---|
| `earned` | `number` | Tổng sao tích lũy từ tất cả buổi học được giáo viên đánh giá |
| `spent` | `number` | Tổng sao đã tiêu (đổi quà / mua hàng) |
| `available` | `number` | Số sao hiện còn = `earned − spent` (tối thiểu 0) |
| `isParent` | `boolean` | `true` nếu token là tài khoản phụ huynh |
| `students` | `array` | Chỉ có dữ liệu khi `isParent: true` — breakdown từng con (xem bên dưới) |
| `transactions` | `array` | Lịch sử tiêu sao, sắp xếp mới nhất trước, tối đa 100 bản ghi |

**Khi `isParent: true` — field `students`:**
```json
{
  "students": [
    {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "code": "HV001",
      "earned": 30,
      "spent": 8,
      "available": 22
    },
    {
      "id": "uuid",
      "name": "Nguyễn Thị B",
      "code": "HV002",
      "earned": 12,
      "spent": 2,
      "available": 10
    }
  ]
}
```
> Khi `isParent: false`, `students` là mảng rỗng `[]`. Các field `earned/spent/available` ở top-level là tổng của học viên đó.

**Field `transactions[].delta`:**

| Giá trị | Ý nghĩa |
|---|---|
| Số âm (vd: `-5`) | Tiêu sao (đổi quà, mua hàng) |
| Số dương (vd: `+3`) | Điều chỉnh thủ công (hoàn sao khi huỷ phiếu) |

> Sao tích lũy từ buổi học **không** xuất hiện trong `transactions` — chỉ phản ánh qua `earned` ở top-level.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Thiếu hoặc sai JWT Bearer token |
| `403` | Tài khoản không phải học viên / phụ huynh |
| `500` | Lỗi server |

---

## 6. Học viên — Bảng điểm

### 6.1 Danh sách bảng điểm
```
GET /api/mobile/student/score-sheet
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `classId` | Không | Lọc theo UUID lớp |
| `month` | Không | YYYY-MM |
| `dateFrom` | Không | YYYY-MM-DD |
| `dateTo` | Không | YYYY-MM-DD |
| `page` | Không | Mặc định 1 |
| `pageSize` | Không | Mặc định 20, tối đa 100 |

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Kiểm tra giữa kỳ",
      "classId": "uuid",
      "classCode": "T9A-001",
      "className": "Toán 9A",
      "scoreSheetId": "uuid",
      "scoreSheetName": "Bảng điểm chuẩn",
      "sessionId": "uuid",
      "sessionIndex": 5,
      "sessionDate": "2026-06-10T00:00:00.000Z",
      "weekday": 3,
      "startTime": "08:00",
      "endTime": "10:00",
      "published": true,
      "scores": [
        { "categoryId": "uuid", "categoryName": "Kiểm tra miệng", "score": "8" },
        { "categoryId": "uuid", "categoryName": "Kiểm tra 15'", "score": "9" }
      ],
      "teacherComment": "Em học tốt, cần cải thiện phần bài tập về nhà",
      "createdByName": "Nguyễn Thị B",
      "createdAt": "2026-06-10T12:00:00.000Z",
      "updatedAt": "2026-06-10T12:30:00.000Z",
      "student": { "id": "uuid", "name": "Nguyễn Văn A", "code": "HV001" },
      "isParent": false
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

> **Lưu ý:** Chỉ trả về bảng điểm đã **published** (`published: true`) và học viên đó **có ít nhất 1 điểm hoặc nhận xét** từ giáo viên.  
> **Phụ huynh:** mỗi item có `student` chứa thông tin con sở hữu bảng điểm đó.

---

## 7. Học viên — Thông báo

### 7.1 Danh sách thông báo
```
GET /api/mobile/student/notifications?limit=50&offset=0
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `limit` | Không | Số dòng mỗi trang. Mặc định 50, tối đa 100 |
| `offset` | Không | Vị trí bắt đầu. Mặc định 0 |

**Response:**
```json
{
  "totalUnread": 3,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "title": "Thông báo điểm danh",
      "content": "Bạn đã được điểm danh có mặt buổi học ngày 30/06/2026...",
      "type": "info",
      "category": "attendance",
      "referenceId": "uuid",
      "referenceType": "session",
      "isRead": false,
      "createdAt": "2026-06-30T08:30:00.000Z",
      "deeplink": {
        "screen": "Calendar",
        "params": { "date": "2026-06-30" }
      },
      "student": null
    }
  ]
}
```

> **Phụ huynh:** `student` field chứa thông tin con học viên sở hữu noti đó.  
> Xem [Bảng deeplink](#17-deeplink--screen-routing) để biết mapping `screen` → màn hình app.

---

### 7.2 Số thông báo chưa đọc
```
GET /api/mobile/student/notifications/unread-count
```

**Response — Học viên:**
```json
{ "total": 3 }
```

**Response — Phụ huynh:**
```json
{
  "total": 5,
  "byStudent": [
    { "studentId": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001", "unread": 3 },
    { "studentId": "uuid", "fullName": "Nguyễn Thị B", "code": "HV002", "unread": 2 }
  ]
}
```

---

### 7.3 Đánh dấu đã đọc (1 noti)
```
PATCH /api/mobile/student/notifications/:id/read
```
**Response:** `{ "success": true }`

---

### 7.4 Đánh dấu tất cả đã đọc
```
PATCH /api/mobile/student/notifications/read-all
```
**Response:** `{ "success": true }`

---

## 8. Phụ huynh

### 8.1 Thông tin phụ huynh + danh sách con
```
GET /api/mobile/parent/profile
```
Chỉ dành cho tài khoản có `type = "Phụ huynh"`.

**Response:**
```json
{
  "parent": {
    "id": "uuid",
    "code": "PH001",
    "fullName": "Nguyễn Văn C",
    "type": "Phụ huynh",
    "phone": "0901234567",
    "email": "parent@email.com",
    "dateOfBirth": "1980-01-01",
    "gender": "Nam",
    "address": "123 Nguyễn Huệ",
    "relationship": "Bố",
    "accountStatus": "active",
    "status": "Đang học"
  },
  "linkedStudents": [
    {
      "id": "uuid",
      "code": "HV001",
      "fullName": "Nguyễn Văn A",
      "phone": null,
      "email": null,
      "dateOfBirth": "2010-05-15",
      "gender": "Nam",
      "address": null,
      "accountStatus": "active",
      "status": "Đang học",
      "enrolledClasses": [
        {
          "classId": "uuid",
          "classCode": "T9A-001",
          "className": "Toán 9A",
          "status": "active",
          "startDate": "2026-01-01",
          "endDate": "2026-12-31",
          "totalSessions": 60,
          "attendedSessions": 25,
          "remainingSessions": 35
        }
      ]
    }
  ]
}
```

---

### 8.2 Thông báo phụ huynh
```
GET /api/mobile/parent/notifications?limit=50&offset=0
```
Trả thông báo của phụ huynh **và** tất cả con học viên.

**Response:**
```json
{
  "totalUnread": 3,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "title": "...",
      "content": "...",
      "type": "info",
      "category": "attendance",
      "referenceId": null,
      "referenceType": null,
      "isRead": false,
      "createdAt": "2026-06-30T08:30:00.000Z",
      "student": { "id": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001" },
      "isSelf": false
    }
  ]
}
```
> `isSelf: true` nếu noti thuộc về chính phụ huynh, `false` nếu thuộc con.

---

### 8.3 Số thông báo chưa đọc (phụ huynh)
```
GET /api/mobile/parent/notifications/unread-count
```
**Response:**
```json
{
  "total": 5,
  "byStudent": [
    { "studentId": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001", "unread": 3 }
  ]
}
```

---

### 8.4 Đánh dấu đã đọc — Phụ huynh
```
PATCH /api/mobile/parent/notifications/:id/read
PATCH /api/mobile/parent/notifications/read-all
```
**Response:** `{ "success": true }`

---

## 9. Học online

### 9.1 Cấu hình thời gian học online
```
GET /api/mobile/online-learning-rules
```
Dùng để tính thời điểm bật nút "Vào học" / "Kết thúc".

**Response:**
```json
[
  {
    "id": "uuid",
    "locationId": "uuid",
    "earlyEntryMinutes": 15,
    "lateEntryMinutes": 30,
    "earlyEndMinutes": 10
  }
]
```

**Công thức:**
- Nút "Vào học" mở khi: `now >= startTime - earlyEntryMinutes`
- Nút "Vào học" đóng khi: `now > startTime + lateEntryMinutes`
- Nút "Kết thúc" mở khi: `now >= endTime - earlyEndMinutes`

---

## 10. Nhân viên — Lịch dạy

> Tất cả endpoint trong mục này dùng **JWT Bearer token**.  
> Yêu cầu tài khoản đã có hồ sơ nhân viên (`staff` record). Không giới hạn phòng ban.  
> Bao gồm cả **buổi kiểm tra tập trung** (`isTestSession: true`, `classCode: "TEST"`).  
> Lỗi chung: `401` (thiếu/sai JWT) · `403` (không phải nhân viên) · `500` (lỗi server)

---

### 10.1 Lịch dạy theo tháng
```
GET /api/mobile/staff/calendar?month=YYYY-MM
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | YYYY-MM. Mặc định tháng hiện tại |

**Response 200:**
```json
{
  "month": "2026-06",
  "datesWithSessions": ["2026-06-02", "2026-06-09"],
  "sessions": [
    {
      "classSessionId": "uuid",
      "sessionDate": "2026-06-02",
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "onlineLink": null,
      "sessionStatus": "scheduled",
      "sessionIndex": 1,
      "locationName": "Cơ sở 1",
      "checkInAt": null,
      "checkOutAt": null,
      "isTestSession": false
    },
    {
      "classSessionId": "uuid-test",
      "sessionDate": "2026-06-09",
      "weekday": 1,
      "className": "Thi cuối kỳ HK1",
      "classCode": "TEST",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "onlineLink": null,
      "sessionStatus": "scheduled",
      "sessionIndex": null,
      "locationName": null,
      "checkInAt": null,
      "checkOutAt": null,
      "isTestSession": true
    }
  ]
}
```

> `checkInAt` / `checkOutAt` — thời điểm giáo viên check-in/check-out theo bảng `teacher_attendance`. `null` nếu chưa có.  
> `onlineLink` — link họp online của lớp (nếu `learningFormat = "online"`).  
> Buổi kiểm tra tập trung (`isTestSession: true`) không có `checkInAt`/`checkOutAt`.  
> Kết quả đã sort theo `sessionDate ASC`, `startTime ASC`.

---

### 10.2 Lịch dạy theo ngày *(mới)*
```
GET /api/mobile/staff/calendar/day?date=YYYY-MM-DD
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `date` | Có | YYYY-MM-DD |

**Response 200:**
```json
{
  "date": "2026-06-02",
  "sessions": [
    {
      "classSessionId": "uuid",
      "sessionDate": "2026-06-02",
      "weekday": 1,
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "startTime": "08:00",
      "endTime": "10:00",
      "learningFormat": "offline",
      "onlineLink": null,
      "sessionStatus": "scheduled",
      "sessionIndex": 1,
      "locationName": "Cơ sở 1",
      "checkInAt": "2026-06-02T08:01:00.000Z",
      "checkOutAt": null,
      "enrolledCount": 20,
      "attendancePendingCount": 3,
      "isTestSession": false
    }
  ]
}
```

> Khác với 10.1: có thêm `enrolledCount` và `attendancePendingCount` (thống kê điểm danh nhanh).  
> Buổi kiểm tra tập trung: `attendancePendingCount = 0`, `enrolledCount = student_count` từ `test_sessions`.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `400` | Thiếu hoặc sai định dạng `date` |

---

### 10.3 Chi tiết buổi dạy
```
GET /api/mobile/staff/calendar/session/:classSessionId
```

Hỗ trợ cả UUID từ `class_sessions` lẫn `test_sessions` — tự động fallback.

**Response 200 — buổi thường:**
```json
{
  "classSessionId": "uuid",
  "classId": "uuid",
  "sessionDate": "2026-06-02",
  "weekday": 1,
  "className": "Toán 9A",
  "classCode": "T9A-001",
  "startTime": "08:00",
  "endTime": "10:00",
  "learningFormat": "offline",
  "onlineLink": "https://meet.google.com/xxx",
  "sessionStatus": "scheduled",
  "sessionIndex": 1,
  "totalSessions": 60,
  "locationName": "Cơ sở 1",
  "teachers": [
    { "id": "uuid", "fullName": "Nguyễn Thị B" }
  ],
  "evaluationCriteriaIds": ["uuid"],
  "generalContents": [
    {
      "id": "uuid",
      "type": "homework",
      "title": "Bài 3 trang 45",
      "description": null,
      "resourceUrl": null,
      "attachments": []
    }
  ],
  "enrolledCount": 20,
  "attendancePendingCount": 3,
  "reviewedCount": 17,
  "checkInAt": "2026-06-02T08:01:00.000Z",
  "checkOutAt": null,
  "isTestSession": false
}
```

**Response 200 — buổi kiểm tra tập trung (`isTestSession: true`):**
```json
{
  "classSessionId": "uuid",
  "classId": null,
  "sessionDate": "2026-06-09",
  "weekday": 1,
  "className": "Thi cuối kỳ HK1",
  "classCode": "TEST",
  "startTime": "08:00",
  "endTime": "10:00",
  "learningFormat": "offline",
  "onlineLink": null,
  "sessionStatus": "scheduled",
  "sessionIndex": null,
  "totalSessions": null,
  "locationName": null,
  "teachers": [{ "id": "uuid", "fullName": "Nguyễn Thị B" }],
  "evaluationCriteriaIds": [],
  "generalContents": [],
  "enrolledCount": 45,
  "attendancePendingCount": 0,
  "reviewedCount": 0,
  "checkInAt": null,
  "checkOutAt": null,
  "isTestSession": true
}
```

> `evaluationCriteriaIds` — dùng để render form nhận xét học viên. Mảng rỗng nếu buổi chưa cấu hình tiêu chí.  
> `checkInAt`/`checkOutAt` — thời điểm giáo viên này check-in/check-out (chỉ cho giáo viên đang request).

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `404` | Không tìm thấy buổi học trong cả `class_sessions` lẫn `test_sessions` |

---

### 10.4 Danh sách học viên trong buổi
```
GET /api/mobile/staff/calendar/session/:classSessionId/students
```

**Response 200:**
```json
[
  {
    "studentSessionId": "uuid",
    "studentId": "uuid",
    "studentName": "Nguyễn Văn A",
    "studentCode": "HV001",
    "attendanceStatus": "present",
    "attendanceNote": "",
    "sessionOrder": 1,
    "hasReview": true,
    "reviewPublished": true
  }
]
```

> Loại bỏ học viên đã chuyển lớp (`status = 'transferred'`).  
> Sort theo `sessionOrder ASC`.

| `attendanceStatus` | Mô tả |
|---|---|
| `"pending"` | Chưa điểm danh |
| `"present"` | Có học |
| `"absent"` | Nghỉ học |
| `"makeup_wait"` | Nghỉ, chờ học bù |
| `"makeup_done"` | Đã học bù |
| `"paused"` | Bảo lưu |

---

### 10.5 Nội dung đã giao trong buổi học
```
GET /api/mobile/staff/calendar/session/:classSessionId/contents
```
Trả danh sách nội dung (bài học, bài tập, ...) đã được giao cho buổi học đó.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "contentType": "Bài học",
    "title": "Bài 3 trang 45",
    "description": null,
    "resourceUrl": "library-content-uuid",
    "displayOrder": 1,
    "dueDate": null
  }
]
```

> `resourceUrl` — UUID của nội dung trong thư viện nếu được giao từ thư viện, `null` nếu nhập tay.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Thiếu/sai JWT |
| `403` | Không phải nhân viên |

---

### 10.6 Giao nội dung vào buổi học
```
POST /api/mobile/staff/calendar/session/:classSessionId/contents
```

**Body:**
```json
{
  "contentType": "Bài học",
  "title": "Bài 3 trang 45",
  "description": null,
  "libraryContentId": "library-uuid-hoặc-null",
  "dueDate": null
}
```

| Field | Bắt buộc | Mô tả |
|---|---|---|
| `contentType` | Có | `"Bài học"` \| `"Bài tập về nhà"` \| `"Giáo trình"` \| `"Bài kiểm tra"` |
| `title` | Có | Tên nội dung |
| `description` | Không | Mô tả HTML (rich text) |
| `libraryContentId` | Không | UUID của nội dung trong thư viện (`courseProgramContents.id`) — để liên kết |
| `dueDate` | Không | ISO 8601 — hạn nộp (dùng cho BTVN) |

**Response 201:**
```json
{
  "id": "uuid",
  "classSessionId": "uuid",
  "contentType": "Bài học",
  "title": "Bài 3 trang 45",
  "description": null,
  "resourceUrl": "library-content-uuid",
  "displayOrder": 2,
  "dueDate": null
}
```

> Sau khi giao thành công, gọi `10.3` để reload chi tiết buổi học — `generalContents` sẽ được cập nhật.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `400` | Thiếu `contentType` hoặc `title` |
| `403` | Không phải nhân viên |

---

### 10.7 Xoá nội dung khỏi buổi học
```
DELETE /api/mobile/staff/calendar/session/:classSessionId/contents/:contentId
```

**Response:** `204 No Content`

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `403` | Không phải nhân viên |
| `500` | Nội dung không tồn tại hoặc lỗi server |

---

### 10.8 Danh sách nội dung thư viện
```
GET /api/mobile/staff/library
```
Lấy danh sách nội dung từ thư viện (`/courses?tab=library`) để dùng trong màn hình "Giao nội dung".

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `search` | Không | Tìm theo tên nội dung |
| `type` | Không | `"Bài học"` \| `"Bài tập về nhà"` \| `"Giáo trình"` |
| `programId` | Không | UUID chương trình học để lọc |
| `page` | Không | Trang. Mặc định 1 |
| `pageSize` | Không | Mặc định 20, tối đa 100 |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Bài học số 1",
      "type": "Bài học",
      "content": "<p>Nội dung HTML...</p>",
      "programId": "uuid",
      "programName": "Chương trình Toán 9",
      "attachments": ["Tên file||https://url"],
      "allowDownload": null,
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

> `attachments` — mảng string dạng `"Tên file||URL"`. Parse bằng cách tách theo `||`.  
> `allowDownload: null` = theo mặc định vai trò; `true` = cho phép; `false` = không cho phép.

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Thiếu/sai JWT |

> **Lưu ý:** Endpoint này chỉ yêu cầu JWT hợp lệ — **không** yêu cầu tài khoản phải là nhân viên. Mọi user đăng nhập (giáo viên, nhân viên, ...) đều có thể đọc thư viện.

---

### 10.9 Thêm nội dung mới vào thư viện
```
POST /api/mobile/staff/library
```
Tạo nội dung mới trong thư viện — tương đương nút "Thêm mới" tại `/courses?tab=library` trên web.

**Body:**
```json
{
  "title": "Bài học số 5",
  "type": "Bài học",
  "content": "<p>Mô tả HTML...</p>",
  "programId": "uuid-hoặc-null",
  "attachments": ["Tên file||https://url"],
  "allowDownload": null
}
```

| Field | Bắt buộc | Mô tả |
|---|---|---|
| `title` | Có | Tên nội dung |
| `type` | Có | `"Bài học"` \| `"Bài tập về nhà"` \| `"Giáo trình"` |
| `content` | Không | Mô tả dạng HTML (rich text) |
| `programId` | Không | UUID chương trình học — `null` nếu chưa gán |
| `attachments` | Không | Mảng string `"Tên||URL"` — upload file trước qua `POST /api/upload` |
| `allowDownload` | Không | `true` \| `false` \| `null` (mặc định theo vai trò) |

**Upload file trước khi tạo nội dung:**
```
POST /api/upload
Content-Type: multipart/form-data
Body: files[] (hỗ trợ nhiều file, tối đa 100MB/file)
```
```json
{ "files": [{ "name": "De bai.pdf", "url": "https://s3.../..." }] }
```
Ghép thành attachment: `"De bai.pdf||https://s3.../..."`

**Response 201:** Object nội dung vừa tạo (toàn bộ fields từ DB).

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `400` | Thiếu `title` hoặc `type`, hoặc dữ liệu không hợp lệ |
| `403` | Không phải nhân viên |

---

### 10.10 Danh sách bài kiểm tra (thư viện)
```
GET /api/mobile/staff/exams
```
Lấy danh sách bài kiểm tra để chọn khi "Giao nội dung" (tab Bài kiểm tra).

> ⚠️ **Dùng endpoint này, không dùng `GET /api/exams`.**  
> `GET /api/exams` filter theo `locationIds` của nhân viên — nếu bài kiểm tra không gán cơ sở (`locationId = NULL`) hoặc thuộc cơ sở khác thì bị ẩn.  
> Endpoint này không filter location — trả về toàn bộ bài kiểm tra, phù hợp cho giáo viên chọn khi giao nội dung.

**Auth:** JWT required (không cần staff check — mọi người dùng có token đều xem được).

**Query params:**

| Param | Mặc định | Mô tả |
|---|---|---|
| `search` | `""` | Tìm theo tên hoặc mã đề (ILIKE) |
| `page` | `1` | Trang hiện tại |
| `pageSize` | `20` | Số item mỗi trang (tối đa 100) |
| `status` | _(tất cả)_ | Lọc theo trạng thái, ví dụ: `"Đã xuất bản"` |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "code": "KTT",
      "name": "KIỂM TRA TEST",
      "status": "Đã xuất bản",
      "timeLimitMinutes": 10,
      "passingScore": 5.00,
      "maxAttempts": null,
      "description": null
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

**Các field:**

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | UUID bài kiểm tra — dùng để giao vào buổi học |
| `code` | `string` | Mã đề (ví dụ: `"KTT"`, `"Văn 9"`) |
| `name` | `string` | Tên bài kiểm tra |
| `status` | `string` | `"Đã xuất bản"` hoặc trạng thái khác |
| `timeLimitMinutes` | `number\|null` | Thời gian làm bài (phút), `null` = không giới hạn |
| `passingScore` | `number\|null` | Điểm đạt, `null` = không có điểm đạt |
| `maxAttempts` | `number\|null` | Số lần làm tối đa, `null` = không giới hạn |
| `description` | `string\|null` | Mô tả thêm |

**Ví dụ request:**
```
GET /api/mobile/staff/exams?search=IELTS&page=1&pageSize=20&status=Đã xuất bản
Authorization: Bearer <jwt>
```

**Lỗi:**

| HTTP | Tình huống |
|---|---|
| `401` | Thiếu hoặc sai JWT |

---

**So sánh Mobile vs Web — Lịch giáo viên:**

| Tính năng | Mobile (JWT) | Web (Session) |
|---|---|---|
| Lịch tháng | 10.1 `GET /staff/calendar` | `GET /my-space/calendar/staff` |
| Lịch ngày | 10.2 `GET /staff/calendar/day` | — (client-side filter) |
| Chi tiết buổi | 10.3 `GET /staff/calendar/session/:id` | `GET /my-space/calendar/staff/session/:id` |
| Fallback test_sessions | ✅ | ✅ |
| Danh sách học viên | 10.4 `GET .../students` | ❌ không có |
| Nội dung đã giao trong buổi | 10.5 `GET .../contents` | (tích hợp trong 10.3 `generalContents`) |
| Giao nội dung vào buổi | 10.6 `POST .../contents` | `SessionContentDialog` (web only) |
| Xoá nội dung khỏi buổi | 10.7 `DELETE .../contents/:id` | `SessionContentDialog` (web only) |
| Danh sách thư viện | 10.8 `GET /staff/library` | `GET /api/course-program-contents` |
| Thêm vào thư viện | 10.9 `POST /staff/library` | `POST /api/course-program-contents` |
| Danh sách bài kiểm tra | 10.10 `GET /staff/exams` | `GET /api/exams` |
| `checkInAt`/`checkOutAt` | ✅ | ✅ |
| `onlineLink` | ✅ | ✅ |
| Lọc Phòng Đào tạo | ❌ (tất cả nhân viên) | ✅ (bắt buộc phải thuộc Phòng ĐT) |

> **Lưu ý quan trọng:** Web API `/my-space/calendar/staff` yêu cầu nhân viên phải thuộc **Phòng Đào tạo** (`isStaffInDaotaoDept`). Mobile API không có hạn chế này — mọi nhân viên đều xem được lịch của mình.  
> **Fix (30/06/2026):** Sau khi "Giao nội dung" trên web, thẻ buổi học trong `/my-space/calendar` cập nhật ngay lập tức — không cần F5 (invalidate thêm query key `staff/session/:id`).

---

## 11. Nhân viên — Bài tập (Phòng Đào tạo)

> Chỉ nhân viên thuộc **Phòng Đào tạo** mới được phép gọi các endpoint này.

### 11.1 Danh sách bài tập học viên
```
GET /api/mobile/staff/assignments
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Không | YYYY-MM |
| `dateFrom` | Không | YYYY-MM-DD |
| `dateTo` | Không | YYYY-MM-DD |
| `status` | Không | `"submitted"` \| `"pending"` \| `"all"` |
| `className` | Không | Lọc theo tên lớp |
| `studentId` | Không | Lọc theo UUID học viên |
| `studentName` | Không | Lọc theo tên học viên (nếu không có studentId) |

**Response:**
```json
{
  "month": "2026-06",
  "rows": [
    {
      "classSessionId": "uuid",
      "className": "Toán 9A",
      "classCode": "T9A-001",
      "sessionDate": "2026-06-02",
      "weekday": 1,
      "startTime": "08:00",
      "endTime": "10:00",
      "sessionIndex": 1,
      "studentId": "uuid",
      "studentName": "Nguyễn Văn A",
      "itemType": "BTVN",
      "homeworkId": "uuid",
      "homeworkTitle": "Bài 3 trang 45",
      "homeworkDescription": null,
      "homeworkAttachments": [],
      "isPersonalized": false,
      "submissionStatus": "submitted",
      "submissionContent": "Bài làm của em...",
      "submissionAttachments": [{ "name": "bai_lam.pdf", "url": "https://..." }],
      "studentSessionContentId": "uuid",
      "score": "9",
      "comment": "Tốt",
      "examId": null
    }
  ]
}
```

---

### 11.2 Chấm điểm bài tập
```
POST /api/mobile/staff/assignments/grade
```

**Body:**
```json
{
  "studentSessionContentId": "uuid",
  "score": "8.5",
  "gradingComment": "Bài làm tốt, cần trình bày rõ hơn"
}
```

**Response:** `{ "success": true }`

---

## 12. Nhân viên — Bảng điểm

### 12.1 Danh sách lớp đang dạy/quản lý
```
GET /api/mobile/staff/classes
```
**Response:**
```json
[
  { "id": "uuid", "classCode": "T9A-001", "name": "Toán 9A", "locationId": "uuid", "scoreSheetId": "uuid" }
]
```

---

### 12.2 Buổi học của lớp (chọn khi tạo bảng điểm)
```
GET /api/mobile/staff/classes/:classId/sessions
```
**Response:**
```json
[
  { "id": "uuid", "sessionIndex": 1, "sessionDate": "2026-06-02", "weekday": 1, "startTime": "08:00", "endTime": "10:00" }
]
```

---

### 12.3 Học viên đang học trong lớp
```
GET /api/mobile/staff/classes/:classId/active-students
```
**Response:**
```json
[
  { "id": "uuid", "fullName": "Nguyễn Văn A", "code": "HV001", "phone": "0901234567", "email": null }
]
```

---

### 12.4 Danh sách mẫu bảng điểm (templates)
```
GET /api/mobile/score-sheets
```
**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Bảng điểm chuẩn",
    "items": [
      {
        "id": "uuid",
        "scoreSheetId": "uuid",
        "categoryId": "uuid",
        "formula": null,
        "order": 1,
        "category": { "id": "uuid", "name": "Kiểm tra miệng" }
      }
    ]
  }
]
```

---

### 12.5 Danh sách grade books của một lớp
```
GET /api/mobile/staff/classes/:classId/grade-books
```
**Response:**
```json
[
  {
    "id": "uuid",
    "classId": "uuid",
    "title": "Kiểm tra giữa kỳ",
    "scoreSheetId": "uuid",
    "scoreSheetName": "Bảng điểm chuẩn",
    "sessionId": "uuid",
    "published": true,
    "createdBy": "uuid",
    "updatedBy": "uuid",
    "createdByName": "Nguyễn Thị B",
    "updatedByName": "Nguyễn Thị B",
    "createdAt": "2026-06-10T12:00:00.000Z",
    "updatedAt": "2026-06-11T09:00:00.000Z"
  }
]
```

---

### 12.6 Chi tiết điểm của grade book
```
GET /api/mobile/staff/classes/:classId/grade-books/:id
```
**Response:**
```json
{
  "scores": [
    { "id": "uuid", "gradeBookId": "uuid", "studentId": "uuid", "categoryId": "uuid", "score": "8" }
  ],
  "studentComments": {
    "student-uuid-1": "Em học tốt",
    "student-uuid-2": "Cần cố gắng hơn"
  }
}
```

---

### 12.7 Tạo grade book mới
```
POST /api/mobile/staff/classes/:classId/grade-books
```

**Body:**
```json
{
  "title": "Kiểm tra giữa kỳ",
  "scoreSheetId": "uuid",
  "sessionId": "uuid",
  "published": false,
  "scores": [
    { "studentId": "uuid", "categoryId": "uuid", "score": "8.5" }
  ],
  "studentComments": {
    "student-uuid": "Em học tốt"
  }
}
```

> Khi `published: true` → hệ thống tự động gửi thông báo cho học viên.

**Response 201:** Grade book object vừa tạo.

---

### 12.8 Cập nhật grade book
```
PUT /api/mobile/staff/classes/:classId/grade-books/:id
```
**Body:** Tương tự POST, tất cả field đều optional.

> Khi chuyển từ `published: false` → `published: true` → gửi thông báo cho học viên.

**Response:** Grade book object đã cập nhật.

---

### 12.9 Xoá grade book
```
DELETE /api/mobile/staff/classes/:classId/grade-books/:id
```
**Response:** `{ "success": true }`

---

### 12.10 Danh sách tất cả grade books của staff
```
GET /api/mobile/staff/score-sheet
```
Trả tất cả grade books thuộc các lớp staff đang dạy/quản lý.

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Kiểm tra giữa kỳ",
    "classId": "uuid",
    "classCode": "T9A-001",
    "className": "Toán 9A",
    "scoreSheetId": "uuid",
    "scoreSheetName": "Bảng điểm chuẩn",
    "sessionId": "uuid",
    "sessionIndex": 5,
    "sessionDate": "2026-06-10",
    "published": true,
    "scoreCount": 40,
    "studentCount": 20,
    "createdByName": "Nguyễn Thị B",
    "updatedByName": "Nguyễn Thị B",
    "createdAt": "2026-06-10T12:00:00.000Z",
    "updatedAt": "2026-06-11T09:00:00.000Z"
  }
]
```

---

## 13. Nhân viên — Tài chính (Lương)

### 13.1 Danh sách phiếu chi lương
```
GET /api/mobile/staff/invoices
```

> **Nguồn dữ liệu:** Server lấy hoá đơn theo **2 nguồn**, giống hệt trang web `/my-space/invoices`:
> 1. `subjectName LIKE '[STAFF_CODE]%'` hoặc `'STAFF_CODE -%'` — hoá đơn gắn trực tiếp bằng mã nhân viên (format cũ)
> 2. `salaryTableId` thuộc bảng lương đã publish cho nhân viên này
>
> Kết quả hai nguồn được hợp nhất, loại bỏ trùng lặp, sắp xếp theo `createdAt` mới nhất trước.

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `status` | Không | `"unpaid"` \| `"partial"` \| `"paid"` \| `"debt"` \| `"cancelled"` |
| `page` | Không | Mặc định 1 |
| `limit` | Không | Mặc định 20, tối đa 100 |

**Response:**
```json
{
  "invoices": [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "title": "Lương tháng 5/2026",
      "code": "PC-001",
      "settleCode": null,
      "label": "Đợt 1",
      "type": "Chi",
      "category": null,
      "amount": "15000000",
      "paidAmount": null,
      "remainingAmount": null,
      "status": "paid",
      "dueDate": "2026-06-05T00:00:00.000Z",
      "paidAt": "2026-06-03T00:00:00.000Z",
      "paymentMethod": "Chuyển khoản",
      "note": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "isSchedule": true,
      "salaryTable": {
        "id": "uuid",
        "name": "Bảng lương GV tháng 5",
        "startDate": "2026-05-01T00:00:00.000Z",
        "endDate": "2026-05-31T00:00:00.000Z",
        "locationName": "Cơ sở 1"
      }
    }
  ],
  "summary": {
    "totalPaid": 15000000,
    "totalUnpaid": 0,
    "totalAmount": 15000000
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "staff": { "id": "uuid", "fullName": "Nguyễn Thị B", "code": "NV001" }
}
```

**Lưu ý trường `salaryTable`:**
- Có giá trị khi hoá đơn thuộc bảng lương đã publish (nguồn 2)
- `null` khi hoá đơn được gắn trực tiếp bằng mã nhân viên trong `subjectName` (nguồn 1)

**Lưu ý trường `isSchedule`:**

| `isSchedule` | `true` | `false` |
|---|---|---|
| `id` | UUID của **đợt thanh toán** | UUID của hoá đơn |
| `amount` | Số tiền đợt | `grandTotal` hoá đơn |
| `paidAmount` | `null` | Số đã thanh toán |
| `remainingAmount` | `null` | Số còn lại |
| `paidAt` | Ngày đã trả đợt | `null` |

---

## 14. Nhân viên — Bảng lương đứng lớp (Payroll)

> Tương đương trang `/my-space/payroll` trên web client.  
> Chỉ hiển thị dữ liệu của bảng lương đã được phòng HR/Kế toán **publish** cho nhân viên.

### 14.1 Danh sách buổi dạy theo bảng lương
```
GET /api/mobile/staff/payroll/published-rows
```
Trả về từng dòng lớp trong các bảng lương đã publish — gồm danh sách buổi dạy chi tiết theo ngày. Dùng để hiển thị tab **Bảng lương đứng lớp**.

**Không có query param** — trả toàn bộ bảng lương đã publish cho nhân viên đó.

**Response:**
```json
[
  {
    "salaryTableId": "uuid",
    "salaryTableName": "Bảng lương GV tháng 6",
    "startDate": "2026-06-01",
    "endDate": "2026-06-30",
    "locationName": "Cơ sở 1",
    "teacherId": "uuid",
    "teacherName": "Nguyễn Văn A",
    "teacherCode": "GV-001",
    "classId": "uuid",
    "className": "Toán 9A",
    "role": "Giáo viên",
    "packageId": "uuid",
    "sessions": [
      {
        "sessionDate": "2026-06-02",
        "sessionIndex": 5,
        "durationHours": 2.0,
        "attendedCount": 12,
        "isEligible": true,
        "coefficient": 1
      }
    ],
    "sessionDates": ["2026-06-02", "2026-06-09"]
  }
]
```

> Mỗi phần tử là **một lớp** trong một bảng lương. Nếu nhân viên dạy nhiều lớp trong cùng bảng lương, mảng trả về có nhiều phần tử.

---

### 14.2 Tổng lương đứng lớp (đã tính sẵn)
```
GET /api/mobile/staff/payroll/salary-summary
```
Trả về tổng lương đứng lớp đã tính sẵn server-side — **không cần client tự tính**. Dùng để hiển thị tổng tiền lương theo lớp và bảng lương.

**Không có query param.**

**Response:**
```json
[
  {
    "salaryTableId": "uuid",
    "salaryTableName": "Bảng lương GV tháng 6",
    "startDate": "2026-06-01",
    "endDate": "2026-06-30",
    "locationName": "Cơ sở 1",
    "grandTotal": 8500000,
    "classes": [
      {
        "classId": "uuid",
        "className": "Toán 9A",
        "role": "Giáo viên",
        "packageId": "uuid",
        "packageName": "Theo buổi 250k",
        "packageType": "theo-buoi",
        "totalEligibleSessions": 8,
        "totalSalary": 2000000
      },
      {
        "classId": "uuid",
        "className": "Lý 10B",
        "role": "Trợ giảng",
        "packageId": "uuid",
        "packageName": "Theo giờ 80k",
        "packageType": "theo-gio",
        "totalEligibleSessions": 6,
        "totalSalary": 960000
      }
    ]
  }
]
```

**Các loại `packageType`:**

| Giá trị | Cách tính |
|---|---|
| `theo-gio` | `durationHours × unitPrice` mỗi buổi |
| `theo-buoi` | `unitPrice` mỗi buổi đủ điều kiện |
| `theo-so-hv` | `attendedCount × priceFromRange` mỗi buổi |
| `tong-so-gio` | Tổng giờ cả kỳ → tra bảng range |
| `tong-so-buoi` | Tổng buổi cả kỳ → tra bảng range |

---

### 14.3 Chấm công theo tháng
```
GET /api/mobile/staff/payroll/attendance
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Có | Tháng (1–12) |
| `year` | Có | Năm (VD: 2026) |

**Response:** Mảng các ngày có ghi nhận công (ngày không có dữ liệu không xuất hiện).
```json
[
  {
    "workDate": "2026-06-02",
    "timeIn": "08:05",
    "timeOut": "17:30",
    "tongCong": 1.0,
    "workedHours": 9.0,
    "note": null
  },
  {
    "workDate": "2026-06-05",
    "timeIn": "09:15",
    "timeOut": "17:00",
    "tongCong": 0.5,
    "workedHours": 7.5,
    "note": "Đến muộn"
  }
]
```

**Logic hiển thị trạng thái ngày công:**

| `tongCong` | Trạng thái |
|---|---|
| `≥ 1.01` | Tăng ca (Overtime) |
| `= 1` | Đủ công (OK) |
| `≥ 0.5` | Nửa công |
| `> 0 và < 0.5` | Thiếu giờ / Đi muộn |
| `= 0` | Vắng / Chưa ghi nhận |

---

### 14.4 Bảng lương HR tổng hợp
```
GET /api/mobile/staff/payroll/hr-summary
```
Trả về bảng lương tổng hợp từ bảng HR (lương cơ bản, phụ cấp, thưởng, bảo hiểm, thực nhận...).  
Trả về `null` nếu chưa có bảng lương HR cho tháng đó.

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `month` | Có | Tháng (1–12) |
| `year` | Có | Năm (VD: 2026) |

**Response:**
```json
{
  "sheetId": "uuid",
  "sheetName": "LUONG-2026-06",
  "sheetMonth": "2026-06",
  "soCong": 22.5,
  "luongCB": 10000000,
  "congThuc": 22,
  "luongTheoCong": 9777778,
  "phuCap": 500000,
  "thuong": 200000,
  "phat": 0,
  "luongDungLop": 8500000,
  "tongLuong": 18977778,
  "bhxh": 1750000,
  "bhyt": 300000,
  "bhtn": 175000,
  "thueTNCN": 0,
  "tamUng": 0,
  "thucNhan": 16752778,
  "daChi": false
}
```

**Ý nghĩa các trường:**

| Trường | Mô tả |
|---|---|
| `soCong` | Số công thực tế (từ bảng chấm công) |
| `congThuc` | Số công quy đổi theo công thức |
| `luongCB` | Lương cơ bản hợp đồng |
| `luongTheoCong` | Lương theo công = `luongCB × congThuc / chuanCong` |
| `phuCap` | Tổng phụ cấp |
| `thuong` | Thưởng |
| `phat` | Phạt/Khấu trừ |
| `luongDungLop` | Lương đứng lớp (từ bảng lương GV) |
| `tongLuong` | Tổng lương = `luongTheoCong + phuCap + thuong - phat + luongDungLop` |
| `bhxh` / `bhyt` / `bhtn` | Bảo hiểm xã hội / y tế / thất nghiệp |
| `thueTNCN` | Thuế thu nhập cá nhân |
| `tamUng` | Tạm ứng đã nhận |
| `thucNhan` | Thực nhận = `tongLuong - bhxh - bhyt - bhtn - thueTNCN - tamUng` |
| `daChi` | `true` nếu đã chi thực tế |

---

## 15. Nhân viên — Học viên sắp hết lịch & Lớp sắp kết thúc

> Tất cả endpoint trong mục này dùng **JWT Bearer token**.  
> Yêu cầu tài khoản nhân viên (`staff` record).  
> Lỗi chung: `401` (thiếu/sai JWT) · `403` (không phải nhân viên hoặc không có quyền) · `500` (lỗi server)

### ⚠️ Quy tắc bắt buộc về phân quyền phía mobile

| Bước | Hành động |
|---|---|
| 1 | Gọi `GET /api/mobile/learning-overview/meta` sau khi login |
| 2 | Nếu `permissions.canView === false` → **ẩn toàn bộ tab/tính năng Learning Overview** |
| 3 | Nếu `permissions.canView === true` → hiển thị bình thường |

> Server **cũng tự enforce** 403 tại từng endpoint — mobile gate UI là lớp thứ hai, tránh UX xấu.

---

### 15.0 Meta — Quyền truy cập
```
GET /api/mobile/learning-overview/meta
```

**Response:**
```json
{
  "permissions": {
    "canView": true
  }
}
```

| Trường | Ý nghĩa |
|---|---|
| `canView` | `true` → role được phép xem Học viên sắp hết lịch & Lớp sắp kết thúc |

**Mặc định khi tạo role mới:** `canView = false` — **phải được cấp quyền thủ công mới xem được**.  
Quản trị viên cấp quyền tại **Cài đặt → Vai trò → Phân quyền → `/learning-overview#list`**.

---

### 15.1 Badge count
```
GET /api/mobile/learning-overview/summary
```

> Yêu cầu `permissions.canView = true`. Trả về `403` nếu không có quyền.

**Response:**
```json
{
  "studentsEndingSoon": 12,
  "classesEndingSoon": 3
}
```

---

### 15.2 Danh sách học viên sắp hết lịch
```
GET /api/mobile/students-ending-soon
```

> Yêu cầu `permissions.canView = true`. Trả về `403` nếu không có quyền.

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `page` | Không | Mặc định 1 |
| `pageSize` | Không | Mặc định 20, tối đa 50 |
| `search` | Không | Tìm theo tên hoặc mã học viên |
| `classes` | Không | Lọc theo classCode, có thể lặp nhiều lần |
| `maxRemaining` | Không | Lọc số buổi còn lại <= giá trị này |
| `dateFrom` | Không | Lọc ngày kết thúc >= YYYY-MM-DD |
| `dateTo` | Không | Lọc ngày kết thúc <= YYYY-MM-DD |
| `statusFilter` | Không | `"ending-soon"` \| `"active"` \| `"ended"` |

**Nghiệp vụ màu cảnh báo:**
- `remainingSessions <= 2` → 🔴 Đỏ (rất gấp)
- `remainingSessions 3–4` → 🟠 Cam
- `remainingSessions 5–10` → 🟡 Vàng

**Thứ tự sắp xếp:** sắp kết thúc trước → đang học → đã kết thúc; trong mỗi nhóm ưu tiên số buổi còn ít nhất.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "studentId": "uuid",
      "classId": "uuid",
      "status": "active",
      "startDate": "2026-01-01",
      "endDate": "2026-07-10",
      "studentStatus": "Đang học",
      "totalSessions": 60,
      "attendedSessions": 55,
      "remainingSessions": 4,
      "studentCode": "HV001",
      "studentName": "Nguyễn Văn A",
      "studentPhone": "0901234567",
      "studentEmail": null,
      "accountStatus": "Hoạt động",
      "classCode": "T9A-001",
      "className": "Toán 9A"
    }
  ],
  "total": 25,
  "page": 1,
  "pageSize": 20,
  "availableClasses": [
    { "code": "T9A-001", "label": "Toán 9A" }
  ]
}
```

> `accountStatus`: `"Hoạt động"` | `"Không hoạt động"` — trạng thái tài khoản học viên. Dùng để hiển thị cảnh báo tài khoản bị khoá.

---

### 15.3 Danh sách lớp học sắp kết thúc
```
GET /api/mobile/classes-ending-soon
```

> Yêu cầu `permissions.canView = true`. Trả về `403` nếu không có quyền.

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `page` | Không | Mặc định 1 |
| `pageSize` | Không | Mặc định 20, tối đa 50 |
| `search` | Không | Tìm theo mã hoặc tên lớp |
| `classes` | Không | Lọc theo classCode, có thể lặp nhiều lần |
| `maxRemaining` | Không | Lọc số buổi còn lại <= giá trị này |
| `dateFrom` | Không | Lọc ngày kết thúc >= YYYY-MM-DD |
| `dateTo` | Không | Lọc ngày kết thúc <= YYYY-MM-DD |
| `statusFilter` | Không | `"ending-soon"` \| `"active"` \| `"ended"` |

**Điều kiện lọc:** Chỉ trả về lớp có `status IN ('active', 'planning')` và số buổi còn lại `<= 10`.

**Quyền:** Nhân viên chỉ thấy lớp thuộc cơ sở được phân công. Super admin thấy toàn bộ.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "classCode": "T9A-001",
      "className": "Toán 9A",
      "weekdays": [2, 4, 6],
      "teacherIds": ["uuid1", "uuid2"],
      "teacherNames": "Nguyễn Văn A, Trần Thị B",
      "endDate": "2026-07-15",
      "locationName": "Cơ sở 1",
      "remainingSessions": 3
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20,
  "availableClasses": [
    { "code": "T9A-001", "label": "Toán 9A" }
  ]
}
```

**Thứ tự sắp xếp:** sắp kết thúc (`remainingSessions < 5`) trước, rồi đang học, rồi đã kết thúc; trong mỗi nhóm ưu tiên số buổi còn ít nhất.

**`weekdays`:** Mảng số ngày trong tuần — `1` = Chủ nhật, `2` = Thứ hai, ..., `7` = Thứ bảy.

---

## 16. Buổi kiểm tra (Test Session)

### 16.1 Kiểm tra & ghi nhận lượt làm bài
```
POST /api/mobile/test-content-attempt
```

**Body:**
```json
{
  "testSessionId": "uuid",
  "contentId": "uuid",
  "contentType": "assignment",
  "studentId": "uuid"
}
```

**Response — Còn lượt:**
```json
{ "allowed": true, "attemptsUsed": 2, "maxAttempts": 3 }
```

**Response — Hết lượt:**
```json
{ "allowed": false, "attemptsUsed": 3, "maxAttempts": 3 }
```

---

## 17. Nhận xét (Review)

### 17.1 Xem dữ liệu nhận xét của student session
```
GET /api/student-sessions/:id/review
```

**Response:**
```json
{
  "reviewData": {
    "teacher-uuid": {
      "teacherName": "Nguyễn Thị B",
      "items": [
        {
          "criteriaId": "uuid",
          "criteriaName": "Thái độ học tập",
          "subCriteriaName": "Tập trung",
          "comment": "Tốt"
        }
      ],
      "criteriaRatings": { "criteria-uuid": 4 }
    }
  },
  "reviewPublished": true
}
```

---

## 18. Deeplink / Screen Routing

App mobile nhận `deeplink.screen` và `deeplink.params` từ API thông báo để điều hướng màn hình.

---

### 18.1 Học viên / Phụ huynh

| `screen` | Màn hình | `params` |
|---|---|---|
| `"Calendar"` | Lịch học của học viên | `{ date?: "YYYY-MM-DD" }` |
| `"Assignments"` | Bài tập | `{ date?: "YYYY-MM-DD" }` |
| `"Invoices"` | Học phí | `{ invoiceId?: "uuid" }` |
| `"ScoreSheet"` | Bảng điểm | `{}` |
| `null` | Không navigate | `{}` |

**Mapping theo `category`:**

| `category` | `screen` |
|---|---|
| `attendance` / `schedule` / `class` / `review` | `Calendar` |
| `content` / `assignment` | `Assignments` |
| `finance` | `Invoices` |
| `general` / `task` | `null` |

**Mapping theo `referenceType`:**

| `referenceType` | `screen` |
|---|---|
| `session` / `class` / `schedule` / `attendance` | `Calendar` |
| `assignment` / `homework` / `content` | `Assignments` |
| `grade_book` / `score_sheet` | `ScoreSheet` |
| `invoice` | `Invoices` |

---

### 18.2 Nhân viên / Giáo viên

| `screen` | Màn hình | `params` | Ghi chú |
|---|---|---|---|
| `"StaffCalendar"` | Lịch dạy cá nhân | `{ date?: "YYYY-MM-DD" }` | Mở đúng ngày có buổi dạy |
| `"StaffGradeBook"` | Bảng điểm | `{ gradeBookId?: "uuid" }` | Mở thẳng grade book nếu có ID |
| `"StaffSalary"` | Lương / Tài chính | `{}` | — |
| `"StaffTasks"` | Công việc | `{ taskId?: "uuid" }` | Mở thẳng task nếu có ID |
| `null` | Không navigate | `{}` | — |

**Mapping theo `category` (staff):**

| `category` | `screen` |
|---|---|
| `attendance` / `schedule` / `class` / `session` | `StaffCalendar` |
| `content` / `assignment` | `StaffCalendar` |
| `finance` | `StaffSalary` |
| `task` | `StaffTasks` |
| `general` | `null` |

**Mapping theo `referenceType` (staff):**

| `referenceType` | `screen` |
|---|---|
| `session` / `class` / `schedule` / `attendance` | `StaffCalendar` |
| `assignment` / `homework` / `content` | `StaffCalendar` |
| `grade_book` / `score_sheet` | `StaffGradeBook` |
| `salary` / `payroll` | `StaffSalary` |
| `task` | `StaffTasks` |

> **Ưu tiên title/content:** Nếu `title` hoặc `content` chứa từ khoá "bảng điểm" → luôn dùng `StaffGradeBook`, bất kể `category`.

**Cách trích `date` từ nội dung thông báo:**

Server tự trích ngày theo thứ tự ưu tiên:
1. `DD/MM/YYYY` (4 chữ số năm) trong trường `content`
2. `DD/MM/YY` (2 chữ số năm) trong trường `content`
3. Trường `referenceDate` (định dạng `YYYY-MM-DD`)
4. Không tìm thấy → `params` không có `date`

---

### 18.3 Ví dụ deeplink thực tế (staff)

**Nhắc lịch dạy:**
```json
{
  "category": "schedule",
  "referenceType": "session",
  "referenceId": "uuid-buoi-hoc",
  "content": "Bạn có lịch dạy TNL sẽ bắt đầu lúc 14:00, T2 29/06/2026",
  "deeplink": {
    "screen": "StaffCalendar",
    "params": { "date": "2026-06-29" }
  }
}
```

**Bảng điểm mới:**
```json
{
  "category": "general",
  "referenceType": "grade_book",
  "referenceId": "uuid-grade-book",
  "title": "Bảng điểm lớp A37 đã được tạo",
  "deeplink": {
    "screen": "StaffGradeBook",
    "params": { "gradeBookId": "uuid-grade-book" }
  }
}
```

**Phiếu lương:**
```json
{
  "category": "finance",
  "referenceType": "salary",
  "deeplink": {
    "screen": "StaffSalary",
    "params": {}
  }
}
```

**Công việc được giao:**
```json
{
  "category": "task",
  "referenceType": "task",
  "referenceId": "uuid-task",
  "deeplink": {
    "screen": "StaffTasks",
    "params": { "taskId": "uuid-task" }
  }
}
```

---

## 19. Enum & Giá trị tham chiếu

### attendanceStatus

> Đây là giá trị thực tế trong DB — không có `late` hay `excused`.

| Giá trị | Label (VI) | Mô tả |
|---|---|---|
| `"pending"` | Chưa điểm danh | Mặc định khi tạo buổi, chưa điểm danh |
| `"present"` | Có học | Học viên có mặt và học bình thường |
| `"absent"` | Nghỉ học | Vắng không phép, không học bù |
| `"makeup_wait"` | Nghỉ chờ bù | Vắng, đã được xếp học bù nhưng chưa học |
| `"makeup_done"` | Đã học bù | Đã hoàn thành buổi học bù |
| `"paused"` | Bảo lưu | Học viên đang bảo lưu lịch học |

### sessionStatus
| Giá trị | Mô tả |
|---|---|
| `"scheduled"` | Sắp diễn ra |
| `"completed"` | Đã hoàn thành |
| `"cancelled"` | Đã huỷ |

### learningFormat
| Giá trị | Mô tả |
|---|---|
| `"offline"` | Học trực tiếp |
| `"online"` | Học online |
| `"hybrid"` | Kết hợp |

### weekday
| Giá trị | Ngày |
|---|---|
| `0` | Chủ nhật |
| `1` | Thứ 2 |
| `2` | Thứ 3 |
| `3` | Thứ 4 |
| `4` | Thứ 5 |
| `5` | Thứ 6 |
| `6` | Thứ 7 |

### submissionStatus
| Giá trị | Mô tả |
|---|---|
| `"pending"` | Chưa nộp |
| `"submitted"` | Đã nộp |

### invoiceStatus
| Giá trị | Mô tả |
|---|---|
| `"unpaid"` | Chưa thanh toán |
| `"partial"` | Thanh toán một phần |
| `"paid"` | Đã thanh toán |
| `"debt"` | Nợ |
| `"cancelled"` | Đã huỷ |

### userType (sau đăng nhập)
| Giá trị | Mô tả |
|---|---|
| `"student"` | Học viên |
| `"parent"` | Phụ huynh |
| `"staff"` | Nhân viên / Giáo viên |
| `"unknown"` | Tài khoản không gắn role |

---

## 20. Nhân viên — Công việc (Tasks)

> Tương đương trang `/tasks` trên web client.  
> Mobile Tasks API nằm trong file riêng `mobile-tasks.routes.ts` và đã được đăng ký đầy đủ.  
> Quyền truy cập được kiểm soát theo role — mỗi response đều trả về `permissions` để client ẩn/hiện nút tương ứng.

### ⚠️ Quy tắc bắt buộc về phân quyền phía mobile

**Server LUÔN enforce quyền ở tầng API:**

| Action | Permission cần có | Nếu thiếu |
|---|---|---|
| Xem danh sách tasks | `canView = true` | Danh sách trả về rỗng |
| Tạo task | `canCreate = true` | Server trả `403 Forbidden` |
| Sửa task | `canEdit = true` | Server trả `403 Forbidden` |
| Xoá task | `canDelete = true` | Server trả `403 Forbidden` |

**Mobile app BẮT BUỘC phải:**
1. Gọi `GET /api/mobile/tasks/meta` khi vào trang Tasks để lấy `permissions`
2. Ẩn nút **Tạo công việc** khi `permissions.canCreate === false`
3. Ẩn nút **Sửa** khi `permissions.canEdit === false`
4. Ẩn nút **Xoá** khi `permissions.canDelete === false`
5. Không hiển thị form tạo/sửa khi thiếu quyền tương ứng

> ⚠️ Nếu mobile app không kiểm tra `permissions` và vẫn gọi POST/PATCH/DELETE khi thiếu quyền, server sẽ trả `403`. Tuy nhiên, việc hiển thị nút không hợp lệ gây trải nghiệm xấu cho người dùng — **mobile phải ẩn UI theo permissions, không chỉ dựa vào 403 từ server**.

### 20.1 Meta — Statuses, Levels, Quyền, Staff, Students
```
GET /api/mobile/tasks/meta
```
Gọi đầu tiên khi vào trang Tasks để lấy toàn bộ dữ liệu cần thiết cho UI: trạng thái, mức độ ưu tiên, quyền của user, **danh sách nhân viên và học viên để populate dropdown form tạo/sửa task**.

> ⚠️ **Lưu ý kỹ thuật:** Route `/meta` phải được khai báo **trước** `/:id` trong Express, nếu không Express sẽ match "meta" như một task ID và trả về 500. Đây là bug đã được fix.

**Response:**
```json
{
  "permissions": {
    "canView": true,
    "canViewAll": false,
    "canCreate": true,
    "canEdit": true,
    "canDelete": false
  },
  "statuses": [
    { "id": "uuid", "name": "Cần làm", "color": "#6366f1", "position": 0, "isFixed": false }
  ],
  "levels": [
    { "id": "uuid", "name": "Khẩn cấp", "color": "#ef4444", "position": 0 }
  ],
  "staff": [
    { "id": "uuid", "fullName": "Nguyễn Văn A", "code": "GV-01" }
  ],
  "students": [
    { "id": "uuid", "fullName": "Trần Thị B", "code": "HV-001" }
  ],
  "locations": [
    { "id": "uuid", "name": "Cơ sở chính" }
  ],
  "departments": [
    { "id": "uuid", "name": "Phòng Đào tạo" }
  ]
}
```

**Dùng `staff` và `students` để populate dropdown trong form tạo/sửa task:**

| Field form | Nguồn dữ liệu | Gửi lên khi tạo/sửa |
|---|---|---|
| Quản lý | `staff[].id` / `staff[].fullName` | `managerIds: [staffId, ...]` |
| Người thực hiện | `staff[].id` / `staff[].fullName` | `assigneeIds: [staffId, ...]` |
| Đối tượng | `students[].id` / `students[].fullName` | `subjectIds: [studentId, ...]` |
| Cơ sở | `locations[].id` / `locations[].name` | `locationIds: [locationId, ...]` |
| Phòng ban | `departments[].id` / `departments[].name` | `departmentId: "uuid"` |

**Quy tắc hiển thị UI theo `permissions`:**

| Quyền | Ý nghĩa |
|---|---|
| `canView` | Thấy các task mình tạo, mình quản lý, hoặc được giao |
| `canViewAll` | Thấy toàn bộ task thuộc cơ sở được phân công |
| `canCreate` | Hiển thị nút Tạo công việc |
| `canEdit` | Hiển thị nút Sửa / Thay đổi trạng thái |
| `canDelete` | Hiển thị nút Xoá task |

---

### 20.2 Danh sách Kanban (theo cột trạng thái)
```
GET /api/mobile/tasks/kanban
```
Trả về tasks đã nhóm theo cột status — phù hợp cho giao diện Kanban board.

**Response:**
```json
{
  "permissions": { "canView": true, "canViewAll": false, "canCreate": true, "canEdit": true, "canDelete": false },
  "statuses": [ { "id": "uuid", "name": "Cần làm", "color": "#6366f1", "position": 0, "isFixed": false } ],
  "levels": [ { "id": "uuid", "name": "Khẩn cấp", "color": "#ef4444", "position": 0 } ],
  "columns": [
    {
      "status": { "id": "uuid", "name": "Cần làm", "color": "#6366f1", "position": 0, "isFixed": false },
      "tasks": [ { "id": "uuid", "title": "Họp nhóm giáo viên", "...": "..." } ]
    },
    {
      "status": null,
      "tasks": [ { "id": "uuid", "title": "Task chưa gán trạng thái" } ]
    }
  ]
}
```

> Cột `status: null` chứa các task chưa được gán trạng thái — luôn đặt đầu tiên nếu có.

---

### 20.3 Danh sách phẳng (List View)
```
GET /api/mobile/tasks
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `statusId` | Không | Lọc theo UUID trạng thái |
| `levelId` | Không | Lọc theo UUID mức độ ưu tiên |
| `search` | Không | Tìm kiếm theo tiêu đề (không phân biệt hoa thường) |

**Response:**
```json
{
  "permissions": { "canCreate": true, "canEdit": true, "canDelete": false, "..." : "..." },
  "statuses": [ "..." ],
  "levels": [ "..." ],
  "tasks": [
    {
      "id": "uuid",
      "title": "Họp nhóm giáo viên",
      "description": "Nội dung họp...",
      "locationIds": ["uuid"],
      "departmentId": "uuid",
      "statusId": "uuid",
      "levelId": "uuid",
      "dueDate": "2026-07-10T09:00:00.000Z",
      "subjectIds": [],
      "managerIds": ["uuid"],
      "assigneeIds": ["uuid1", "uuid2"],
      "attachments": [],
      "createdBy": "userId",
      "createdAt": "2026-06-01T08:00:00.000Z",
      "updatedAt": "2026-06-15T10:30:00.000Z",
      "managers": [{ "id": "uuid", "fullName": "Nguyễn Văn A", "code": "NV-001" }],
      "assignees": [{ "id": "uuid", "fullName": "Trần Thị B", "code": "NV-002" }]
    }
  ]
}
```

---

### 20.4 Chi tiết một task
```
GET /api/mobile/tasks/:id
```

**Response:**
```json
{
  "permissions": { "canEdit": true, "canDelete": false },
  "task": { "id": "uuid", "title": "Họp nhóm", "description": "...", "..." : "..." },
  "status": { "id": "uuid", "name": "Đang làm", "color": "#f59e0b", "position": 1, "isFixed": false },
  "level": { "id": "uuid", "name": "Bình thường", "color": "#94a3b8", "position": 1 },
  "managers": [{ "id": "uuid", "fullName": "Nguyễn Văn A", "code": "NV-001", "phone": "0901234567", "email": "a@edu.vn" }],
  "assignees": [{ "id": "uuid", "fullName": "Trần Thị B", "code": "NV-002", "phone": null, "email": null }],
  "subjects": [{ "id": "uuid", "fullName": "Học viên C", "code": "HV-003", "type": "Học viên", "phone": "0912345678" }],
  "locationDetails": [{ "id": "uuid", "name": "Cơ sở 1", "code": "MAIN" }],
  "department": { "id": "uuid", "name": "Phòng Đào tạo" },
  "creatorName": "Nguyễn Văn Admin (AD-001)"
}
```

---

### 20.5 Tạo task
```
POST /api/mobile/tasks
```
Yêu cầu `canCreate` permission.

**Body:**
```json
{
  "title": "Họp nhóm giáo viên",
  "content": "Nội dung mô tả...",
  "locationIds": ["uuid"],
  "departmentId": "uuid",
  "statusId": "uuid",
  "levelId": "uuid",
  "dueDate": "2026-07-10T09:00:00.000Z",
  "subjectIds": [],
  "managerIds": ["uuid"],
  "assigneeIds": ["uuid1", "uuid2"],
  "attachments": []
}
```

> Sau khi tạo, hệ thống tự động **gửi thông báo** đến các nhân viên trong `assigneeIds`.

**Response `201`:** Bản ghi task vừa tạo.

---

### 20.6 Cập nhật task
```
PATCH /api/mobile/tasks/:id
```
Yêu cầu `canEdit` permission. Body giống POST nhưng tất cả field đều optional.

> Chỉ gửi thông báo cho những `assigneeIds` **mới được thêm** (không gửi lại cho người đã có).

**Response `200`:** Bản ghi task sau khi cập nhật.

---

### 20.7 Xoá task
```
DELETE /api/mobile/tasks/:id
```
Yêu cầu `canDelete` permission.

**Response `200`:** `{ "message": "Đã xoá công việc" }`

---

### 20.8 File đính kèm

**Xem danh sách:**
```
GET /api/mobile/tasks/:id/attachments
```
**Response:** `[{ "name": "bao_cao.pdf", "url": "https://...", "size": 102400, "mimetype": "application/pdf" }]`

---

**Upload file:**
```
POST /api/mobile/tasks/:id/attachments
Content-Type: multipart/form-data
```
Field name: `files` (có thể upload nhiều file một lúc). Yêu cầu `canEdit`. Giới hạn 100MB/file.

**Response `201`:** `{ "attachments": [{ "name": "...", "url": "...", "size": 0, "mimetype": "..." }] }`

---

**Xoá file:**
```
DELETE /api/mobile/tasks/:id/attachments
```
**Body:** `{ "url": "https://..." }` — URL của file cần xoá.

**Response:** `{ "attachments": [...] }` — Danh sách file còn lại sau khi xoá.

---

### 20.9 Bình luận

**Xem bình luận:**
```
GET /api/mobile/tasks/:id/comments
```
**Response:** `[{ "id": "uuid", "taskId": "uuid", "authorId": "userId", "authorName": "Nguyễn Văn A", "content": "OK rồi", "createdAt": "..." }]`

---

**Thêm bình luận:**
```
POST /api/mobile/tasks/:id/comments
```
**Body:** `{ "content": "Nội dung bình luận" }`

**Response `201`:** Bản ghi comment vừa tạo.

---

**Xoá bình luận:**
```
DELETE /api/mobile/tasks/:taskId/comments/:commentId
```
Yêu cầu `canEdit` hoặc `canDelete`.

**Response:** `{ "message": "Đã xoá bình luận" }`

---

## 21. Nhân viên — Thông báo

> Tất cả endpoint trong mục này dùng **JWT Bearer token**.  
> Yêu cầu tài khoản đã có hồ sơ nhân viên (`staff` record).  
> Lỗi chung: `401` (thiếu/sai JWT) · `403` (không phải nhân viên) · `500` (lỗi server)

---

### 21.1 Danh sách thông báo
```
GET /api/mobile/staff/notifications?limit=50&offset=0
```

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `limit` | Không | Số dòng mỗi trang. Mặc định 50, tối đa 100 |
| `offset` | Không | Vị trí bắt đầu. Mặc định 0 |

**Response:**
```json
{
  "totalUnread": 2,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "title": "Buổi dạy ngày 01/07/2026",
      "content": "Bạn có buổi dạy lúc 08:00 ngày 01/07/2026.",
      "type": "in-app",
      "category": "schedule",
      "referenceId": "uuid",
      "referenceType": "session",
      "isRead": false,
      "createdAt": "2026-07-01T08:00:00.000Z",
      "deeplink": {
        "screen": "StaffCalendar",
        "params": { "date": "2026-07-01" }
      }
    }
  ]
}
```

**Deeplink screen mapping cho nhân viên:**

| Điều kiện | `screen` |
|---|---|
| `category=schedule/attendance/class/session` hoặc `referenceType=session/class/attendance` | `StaffCalendar` |
| `category=content/assignment` hoặc `referenceType=assignment/homework/content` | `StaffCalendar` |
| `title/content` chứa "bảng điểm" hoặc `referenceType=grade_book/score_sheet` | `StaffGradeBook` |
| `category=finance` hoặc `referenceType=salary/payroll` | `StaffSalary` |
| `category=task` hoặc `referenceType=task` | `StaffTasks` |
| Không khớp | `null` |

---

### 21.2 Số thông báo chưa đọc
```
GET /api/mobile/staff/notifications/unread-count
```

**Response:**
```json
{ "total": 2 }
```

---

### 21.3 Đánh dấu đã đọc (1 thông báo)
```
PATCH /api/mobile/staff/notifications/:id/read
```
**Response:** `{ "success": true }`  
**Lỗi 404:** nếu ID không tồn tại hoặc không thuộc về nhân viên đó.

---

### 21.4 Đánh dấu tất cả đã đọc
```
PATCH /api/mobile/staff/notifications/read-all
```
**Response:** `{ "success": true }`

---

## 22. Chat (Tinode)

> **Auth:** Tất cả endpoint dùng **JWT Bearer token**.  
> Chat hoạt động theo mô hình: server cấp credentials → app tự kết nối WebSocket Tinode → nhắn tin realtime qua Tinode SDK.  
> Lỗi chung: `401` (thiếu JWT) · `403` (không có quyền) · `503` (Tinode chưa cấu hình) · `500` (lỗi server)

### Cấu trúc UI chat

App mobile có **2 tab chính**:

| Tab | API chính |
|---|---|
| **Nhóm** | `GET /api/mobile/chat/groups` |
| **Cá nhân** | `POST /api/mobile/chat/p2p/open` |

---

### Luồng kết nối tổng quát

```
1. POST /api/mobile/chat/connect   → Lấy tinodeUrl, login, password, apiKey, tinodeUid
2. App tự kết nối WebSocket Tinode SDK với credentials trên
3. Sau khi đăng nhập Tinode thành công → PUT /api/mobile/chat/uid  (lưu UID)
4. GET /api/mobile/chat/groups     → Lấy toàn bộ nhóm cho tab Nhóm
5. App subscribe topicId từng nhóm qua Tinode SDK để nhắn tin
```

---

### 22.1 Lấy thông tin kết nối Tinode
```
POST /api/mobile/chat/connect
```

Trả về credentials để app tự kết nối WebSocket Tinode. Tự động tạo tài khoản Tinode nếu user chưa có.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "tinodeUrl": "wss://tinode.example.com",
    "apiKey": "AQAAAAAAAAHk",
    "login": "u_abc123def456",
    "password": "deterministic-password",
    "displayName": "Nguyễn Thị B",
    "tinodeUid": "usrXXXXXXXXXX",
    "generatedAt": "2026-07-01T08:00:00.000Z"
  }
}
```

| Trường | Mô tả |
|---|---|
| `tinodeUrl` | WebSocket URL của Tinode server |
| `apiKey` | API key truyền vào Tinode SDK |
| `login` / `password` | Credentials đăng nhập Tinode (deterministic theo userId) |
| `displayName` | Tên hiển thị trong chat (tên nhân viên hoặc học viên) |
| `tinodeUid` | Tinode UID của chính user (`"usrXXX"` hoặc `null` nếu chưa từng kết nối trước đó) |

---

### 22.2 Lưu Tinode UID
```
PUT /api/mobile/chat/uid
Content-Type: application/json
```

Gọi sau khi app đăng nhập Tinode thành công để lưu UID lại phía server (cần cho search-users và P2P chat).

**Body:**
```json
{ "tinodeUid": "usrXXXXXXXXXX" }
```

> `tinodeUid` phải bắt đầu bằng `"usr"`.

**Response 200:**
```json
{ "success": true, "message": "Đã lưu Tinode UID thành công.", "updatedAt": "2026-07-01T08:00:00.000Z" }
```

---

### 22.3 Danh sách nhóm (tab Nhóm)
```
GET /api/mobile/chat/groups
```

Trả về **toàn bộ nhóm** của user: bao gồm nhóm theo lớp học (tự động) và nhóm do staff tạo tay.  
Đây là API duy nhất cần gọi để load tab **Nhóm**.

**Phân quyền:**

| Loại tài khoản | Nhóm nhận được |
|---|---|
| Học viên | Nhóm theo lớp đang học |
| Nhân viên / Giáo viên | Nhóm theo lớp dạy/quản lý + nhóm tạo tay đang là thành viên |
| Super Admin | Tất cả nhóm lớp (tối đa 30) + nhóm tạo tay đang là thành viên |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "topicId": "grpXXXXXXXXXX",
        "name": "Toán 9A",
        "memberCount": 30,
        "isCreator": false,
        "createdAt": "2026-07-01T08:00:00.000Z"
      },
      {
        "topicId": "grpYYYYYYYYYY",
        "name": "Nhóm giáo viên",
        "memberCount": 5,
        "isCreator": true,
        "createdAt": "2026-07-01T08:00:00.000Z"
      }
    ],
    "total": 2,
    "permissions": {
      "canCreate": true
    }
  }
}
```

| Trường | Mô tả |
|---|---|
| `topicId` | Tinode topic ID để subscribe qua SDK (dạng `grpXXX`) |
| `name` | Tên nhóm |
| `memberCount` | Số thành viên |
| `isCreator` | `true` → user là người tạo nhóm |
| `permissions.canCreate` | `true` với nhân viên/giáo viên — dùng để ẩn/hiện nút `+` tạo nhóm |

---

### 22.4 Thông tin nhóm theo lớp (truy cập trực tiếp)
```
GET /api/mobile/chat/channel/:classId
```

Lấy chi tiết kênh + credentials Tinode cho một lớp cụ thể. Kiểm tra quyền truy cập trước khi trả về.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "topicId": "grpXXXXXXXXXX",
    "classId": "uuid-lop-hoc",
    "className": "Toán 9A",
    "tinodeUrl": "wss://tinode.example.com",
    "apiKey": "AQAAAAAAAAHk",
    "fetchedAt": "2026-07-01T08:00:00.000Z"
  }
}
```

**Lỗi 403:** Không phải giáo viên/quản lý lớp đó (với staff), hoặc không phải học viên lớp đó.  
**Lỗi 404:** Không tìm thấy lớp.  
**Lỗi 502:** Không thể tạo Tinode topic cho lớp.

---

### 22.5 Tra tên hiển thị theo Tinode UID
```
GET /api/mobile/chat/users?uids=usrAAA,usrBBB
```

Dùng để hiển thị tên người gửi tin nhắn trong chat (Tinode chỉ trả UID, server tra về tên).

| Query | Bắt buộc | Mô tả |
|---|---|---|
| `uids` | Có | Danh sách Tinode UID, phân cách bằng dấu phẩy. Tối đa 50 UID |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      { "tinodeUid": "usrAAAAAAAAAAA", "displayName": "Nguyễn Thị B" },
      { "tinodeUid": "usrBBBBBBBBBBB", "displayName": "Trần Văn A" }
    ],
    "fetchedAt": "2026-07-01T08:00:00.000Z"
  }
}
```

---

### 22.6 Tìm kiếm người dùng để chat
```
GET /api/mobile/chat/search-users?q=<tên>
```

Tìm user để mở chat cá nhân (P2P) hoặc thêm vào nhóm chat.

**Phân quyền tìm kiếm:**

| Loại tài khoản | Phạm vi tìm kiếm |
|---|---|
| Học viên | Chỉ giáo viên trong các lớp đang học |
| Nhân viên / Admin | Toàn bộ nhân viên + học viên trong hệ thống |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": "uuid",
        "displayName": "Nguyễn Thị B",
        "role": "staff",
        "tinodeLogin": "u_abc123def456",
        "tinodeUid": "usrXXXXXXXXXX"
      }
    ]
  }
}
```

> `tinodeUid` có thể là `null` nếu user chưa từng đăng nhập chat. Dùng `tinodeLogin` làm fallback.

---

### 22.7 Mở chat cá nhân (P2P)
```
POST /api/mobile/chat/p2p/open
Content-Type: application/json
```

> ⚠️ **Đã thay đổi hành vi.** Chat 1-1 **không còn dùng native Tinode P2P** (`usr*` topic) nữa. Server tạo/​trả về một **group topic** (`grp*`) dùng riêng làm kênh DM giữa 2 người — response và cách subscribe đã đổi hoàn toàn so với trước.

Chuẩn bị / mở kênh chat 1-1 với một user. Nếu đã tồn tại DM giữa 2 người thì trả lại kênh cũ; nếu chưa có thì tạo group topic mới và tự động thêm cả 2 vào Tinode (tự tạo tài khoản Tinode cho user kia nếu chưa có).

**Body:**
```json
{ "targetUserId": "uuid-của-user-kia" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "topicId": "grpXXXXXXXXXX",
    "groupId": "uuid-nhom-dm",
    "isNew": true
  }
}
```

| Trường | Mô tả |
|---|---|
| `topicId` | Tinode topic ID để subscribe qua SDK (dạng `grpXXX`, **không** còn `usrXXX`/`tinodeLogin`) |
| `groupId` | ID nội bộ của kênh DM trong DB (bảng `chat_groups`, `is_direct_message = true`) |
| `isNew` | `true` nếu vừa tạo kênh mới, `false` nếu đã có DM từ trước |

**Cách subscribe topic P2P sau khi nhận response:**
```
subscribe topic: topicId   (luôn dạng "grpXXX", giống hệt cách subscribe nhóm ở mục 22.3/22.8)
```

> ⚠️ Trường `tinodeLogin` / `tinodeUid` trong response **không còn tồn tại** — không dùng nữa.

> ℹ️ Kênh DM vừa mở/lấy ở đây **cũng xuất hiện** trong `GET /api/mobile/chat/groups` (mục 22.3) — vì về bản chất nó là một `chat_groups` record như nhóm thường (chỉ khác cờ `is_direct_message = true`, không lộ ra trong response `/groups`). Nếu app muốn tách UI thành 2 tab "Nhóm" / "Cá nhân" như trước, cần tự nhận diện kênh DM bằng cách so khớp `groupId`/`topicId` trả về từ `p2p/open`, vì API `/groups` hiện **không trả cờ `isDirectMessage`**.

---

### 22.8 Tạo nhóm
```
POST /api/mobile/chat/groups
Content-Type: application/json
```

> ⚠️ **Chỉ Nhân viên / Giáo viên** mới được tạo nhóm. Học viên và phụ huynh bị từ chối `403`.

Hỗ trợ 2 luồng tạo nhóm:

**Luồng 1 — Tạo thủ công:**
```json
{
  "name": "Nhóm giáo viên Toán",
  "memberUserIds": ["uuid-thanh-vien-1", "uuid-thanh-vien-2"]
}
```

**Luồng 2 — Tạo từ lớp học** (dùng khi user chọn lớp trong dialog):
```json
{
  "name": "Nhóm Toán 9A",
  "classId": "uuid-lop-hoc",
  "memberUserIds": []
}
```

> Khi có `classId`, server **tự động thêm** toàn bộ giáo viên, phụ trách và học viên active của lớp vào nhóm.  
> `memberUserIds` không cần gồm userId của người tạo — server tự thêm vào.

| Trường | Bắt buộc | Mô tả |
|---|---|---|
| `name` | Có | Tên nhóm |
| `memberUserIds` | Không | Danh sách userId thêm thủ công (không cần gồm bản thân) |
| `classId` | Không | UUID lớp học — auto-fill tất cả thành viên lớp |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "group": {
      "id": "uuid-nhom",
      "name": "Nhóm Toán 9A",
      "topicId": "grpXXXXXXXXXX",
      "createdBy": "uuid-nguoi-tao",
      "classId": "uuid-lop-hoc",
      "createdAt": "2026-07-01T08:00:00.000Z"
    }
  }
}
```

---

### 22.9 Tìm lớp để tạo nhóm
```
GET /api/mobile/chat/classes/search?q=<tên hoặc mã lớp>
```

Dùng trong dialog "Tạo nhóm mới" để hiển thị danh sách lớp cho staff chọn.  
Học viên luôn nhận về danh sách rỗng (không có quyền tạo nhóm).

**Phân quyền:**

| Loại tài khoản | Kết quả |
|---|---|
| Học viên / Phụ huynh | `[]` (không có quyền tạo nhóm) |
| Nhân viên / Giáo viên | Lớp mà họ là **giáo viên** HOẶC **quản lý** HOẶC lớp **thuộc cơ sở** của mình |
| Super Admin | Tất cả lớp (tối đa 20) |

> Staff thường chỉ thấy lớp thỏa **ít nhất một** trong ba điều kiện: là giáo viên của lớp, là quản lý lớp, hoặc lớp đó thuộc cơ sở (location) mà họ được phân công.

| Query | Bắt buộc | Mô tả |
|---|---|---|
| `q` | Không | Từ khoá tìm tên hoặc mã lớp. Để trống → trả 20 lớp gần nhất |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "classes": [
      {
        "id": "uuid-lop-hoc",
        "name": "Toán 9A",
        "classCode": "TOAN9A-2026"
      }
    ]
  }
}
```

> Dùng `id` của lớp chọn để truyền vào `classId` khi gọi `POST /api/mobile/chat/groups` (22.8).

---

### 22.10 Thành viên lớp (auto-fill khi tạo nhóm)
```
GET /api/mobile/chat/classes/:classId/members
```

Lấy danh sách giáo viên + phụ trách + học viên active của một lớp.  
Dùng sau khi chọn lớp trong dialog "Tạo nhóm mới" để preview danh sách thành viên sẽ được thêm.

**Phân quyền:**
- SuperAdmin: xem tất cả
- Staff: phải là giáo viên hoặc phụ trách của lớp
- Học viên: phải đang học lớp đó (status = active)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "members": [
      { "userId": "uuid-gv", "displayName": "Nguyễn Thị B", "role": "staff" },
      { "userId": "uuid-hv", "displayName": "Trần Văn A",   "role": "student" }
    ]
  }
}
```

| Trường | Mô tả |
|---|---|
| `userId` | UUID của user trong hệ thống |
| `displayName` | Tên hiển thị (tên nhân viên hoặc học viên) |
| `role` | `"staff"` hoặc `"student"` |

**Lỗi 403:** Không có quyền xem lớp này.  
**Lỗi 404:** Lớp không tồn tại.

---

### 22.11 Nhóm đã tạo từ lớp (cảnh báo trùng lặp)
```
GET /api/mobile/chat/classes/:classId/groups
```

Lấy danh sách nhóm chat đã được tạo từ lớp học này.  
Dùng trong dialog "Tạo nhóm mới" để hiển thị cảnh báo nếu lớp đã có nhóm (tránh tạo trùng).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "groups": [
      { "id": "uuid-nhom", "name": "Nhóm Toán 9A" }
    ]
  }
}
```

> Nếu `groups` không rỗng, UI nên hiển thị cảnh báo: _"Lớp này đã có nhóm: Nhóm Toán 9A. Bạn vẫn muốn tạo thêm?"_

---

## 23. Bảng tin (News Feed)

> **Resource quyền:** `/news-feed`

**Phân quyền:**

| Quyền | Key | Mô tả |
|-------|-----|-------|
| Xem | `canView` | Xem bài viết thuộc cơ sở mình hoặc bài toàn hệ thống (`locationId = null`) |
| Xem all | `canViewAll` | Như `canView` — cùng phạm vi cơ sở |
| Thêm | `canCreate` | Được đăng bài viết mới |
| Sửa | `canEdit` | Được sửa bài của mình; ghim / bỏ ghim bất kỳ bài nào |
| Xoá | `canDelete` | Được xoá bài của mình (superAdmin miễn điều kiện tác giả) |

> Mặc định tất cả vai trò được cấp `canView = true` khi tạo. SuperAdmin có toàn quyền.

---

### 23.1 Danh sách bài viết
```
GET /api/mobile/news-feed
```

Lọc theo cơ sở của user. Bài ghim (`isPinned = true`) luôn hiển thị trước.

**Query params:**

| Param | Kiểu | Mặc định | Mô tả |
|-------|------|----------|-------|
| `category` | string | — | `thong-bao` \| `su-kien` \| `hoat-dong` \| `hoc-thuat` |
| `limit` | number | `20` | Tối đa `100` |
| `offset` | number | `0` | Phân trang |

**Response 200:**
```json
{
  "permissions": {
    "canView": true,
    "canViewAll": false,
    "canCreate": true,
    "canEdit": false,
    "canDelete": false
  },
  "posts": [
    {
      "id": "uuid",
      "authorId": "uuid",
      "authorName": "Nguyễn Văn A",
      "authorRole": null,
      "category": "thong-bao",
      "content": "Nội dung bài viết...",
      "imageUrl": "https://...",
      "imageUrls": ["https://...", "https://..."],
      "isPinned": true,
      "locationId": null,
      "createdAt": "2026-07-02T09:00:00.000Z",
      "updatedAt": "2026-07-02T09:00:00.000Z",
      "reactions": { "👍": 5, "❤️": 2, "🎉": 0, "😮": 0, "😢": 0, "👏": 1 },
      "myReaction": "👍"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### 23.2 Danh sách bài ghim
```
GET /api/mobile/news-feed/pinned
```

Trả tối đa **3 bài đang được ghim** trong phạm vi cơ sở của user.

> ⚠️ Phải gọi trước `GET /api/mobile/news-feed/:id` để tránh Express nhầm `"pinned"` là post ID.

**Response 200:**
```json
{
  "permissions": { "canView": true, "canViewAll": false, "canCreate": false, "canEdit": true, "canDelete": false },
  "posts": [ /* tối đa 3 post, cấu trúc giống 23.1 */ ]
}
```

---

### 23.3 Chi tiết một bài viết
```
GET /api/mobile/news-feed/:id
```

**Response 200:**
```json
{
  "permissions": {
    "canEdit": true,
    "canDelete": false,
    "isOwner": true
  },
  "post": { /* cấu trúc giống phần tử trong 23.1 */ }
}
```

| Lỗi | Mô tả |
|-----|-------|
| `403` | Bài viết không thuộc cơ sở của user |
| `404` | Không tìm thấy bài viết |

---

### 23.4 Đăng bài viết mới
```
POST /api/mobile/news-feed
```
Yêu cầu **canCreate**.

**Body:**
```json
{
  "content": "Nội dung bài viết",
  "category": "thong-bao",
  "imageUrls": ["https://s3.../anh1.jpg"],
  "locationId": null
}
```

| Field | Bắt buộc | Ghi chú |
|-------|----------|---------|
| `content` | ✅ | 1–10 000 ký tự |
| `category` | ✅ | `thong-bao` \| `su-kien` \| `hoat-dong` \| `hoc-thuat` |
| `imageUrls` | ❌ | Mảng URL ảnh đã upload lên S3 |
| `locationId` | ❌ | UUID cơ sở; `null` = hiển thị toàn hệ thống |

**Response 201:**
```json
{
  "post": {
    "id": "uuid",
    "authorName": "Nguyễn Văn A",
    "category": "thong-bao",
    "content": "...",
    "isPinned": false,
    "reactions": { "👍": 0, "❤️": 0, "🎉": 0, "😮": 0, "😢": 0, "👏": 0 },
    "myReaction": null,
    "createdAt": "2026-07-02T09:00:00.000Z"
  }
}
```

---

### 23.5 Sửa bài viết
```
PATCH /api/mobile/news-feed/:id
```
Yêu cầu **canEdit** và là **tác giả** (superAdmin miễn điều kiện tác giả). Tất cả field đều optional.

**Body:**
```json
{
  "content": "Nội dung mới",
  "category": "su-kien",
  "imageUrls": ["https://s3.../anh-moi.jpg"]
}
```

**Response 200:**
```json
{ "post": { /* bài viết đã cập nhật + reactions + myReaction */ } }
```

| Lỗi | Mô tả |
|-----|-------|
| `403` | Không phải tác giả |
| `404` | Không tìm thấy bài viết |

---

### 23.6 Xoá bài viết
```
DELETE /api/mobile/news-feed/:id
```
Yêu cầu **canDelete** và là **tác giả**.

**Response 200:**
```json
{ "message": "Đã xoá bài viết." }
```

| Lỗi | Mô tả |
|-----|-------|
| `403` | Không phải tác giả hoặc không đủ quyền |
| `404` | Không tìm thấy bài viết |

---

### 23.7 Thả / rút cảm xúc
```
POST /api/mobile/news-feed/:id/react
```
Yêu cầu **canView**. Gọi lại với cùng `reaction` = rút cảm xúc.

**Body:**
```json
{ "reaction": "👍" }
```

Giá trị hợp lệ: `👍` `❤️` `🎉` `😮` `😢` `👏`

**Response 200:**
```json
{ "myReaction": "👍" }
```
> `myReaction: null` nếu đã rút.

---

### 23.8 Ghim / bỏ ghim bài viết
```
PATCH /api/mobile/news-feed/:id/pin
```
Yêu cầu **canEdit**. Toggle — gọi lần 2 sẽ bỏ ghim.

**Response 200:**
```json
{ "isPinned": true }
```

| Lỗi | Mô tả |
|-----|-------|
| `403` | Không đủ quyền `canEdit` |
| `404` | Không tìm thấy bài viết |

---

## 24. Push Notification Token

> **Auth:** JWT Bearer token  
> App gọi endpoint này ngay sau khi đăng nhập thành công và lấy được Expo Push Token của thiết bị. Backend lưu token để dùng khi cần gửi thông báo xuống thiết bị qua Expo Push API.

---

### 24.1 Lưu Push Token của thiết bị

```
POST /api/mobile/push-token
Content-Type: application/json
```

Lưu hoặc cập nhật Expo Push Token. Upsert theo `pushToken` — nếu token đã tồn tại (thiết bị đổi chủ khi đăng xuất/đăng nhập tài khoản khác), `userId` sẽ được cập nhật sang user hiện tại. Một user có thể có nhiều token (nhiều thiết bị).

**Body:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `pushToken` | ✅ | Expo Push Token của thiết bị. Định dạng: `ExponentPushToken[...]` hoặc `ExpoPushToken[...]` |
| `platform` | ✅ | `"android"` hoặc `"ios"` |

**Response 200:**
```json
{ "success": true }
```

| Lỗi | Mô tả |
|-----|-------|
| `400` | `pushToken` không đúng định dạng Expo, hoặc `platform` không phải `android`/`ios` |
| `401` | Chưa đăng nhập / JWT không hợp lệ |
| `500` | Lỗi server |

> **Lưu ý multi-tenant:** Mỗi trung tâm có backend riêng (`centerUrl`). Endpoint này phải tồn tại trên backend của từng trung tâm — không phải 1 chỗ chung. Khi cần gửi push, backend tự gọi Expo Push API với các token đã lưu, không cần app hỗ trợ thêm.

---

### Cách backend gửi Push Notification (Expo Push API)

Khi có sự kiện cần thông báo, backend truy vấn bảng `push_tokens` theo `user_id`, rồi gọi:

```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json
```

```json
[
  {
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "Lịch học đổi giờ",
    "body": "Buổi học ngày mai chuyển sang 18h00",
    "data": { "type": "schedule_change", "sessionId": "123" },
    "sound": "default",
    "priority": "high",
    "channelId": "default"
  }
]
```

> `channelId: "default"` — app đã tạo sẵn kênh Android tên này, cần truyền đúng để âm thanh/ưu tiên hoạt động đúng.  
> Tối đa **100 token/request**. Không cần API key. Tài liệu đầy đủ: https://docs.expo.dev/push-notifications/sending-notifications/

Utility sẵn có: `server/lib/expo-push.ts` — export `sendExpoPushNotifications(messages)` (tự batch, xử lý lỗi) và `extractInvalidTokens(messages, tickets)` (phát hiện token hết hạn cần xoá khỏi DB).

---

### 24.2 Notification chat — data contract & xử lý khi bấm vào (⚠️ App cần code thêm)

> Đã kiểm thử thực tế: notification **tự hiển thị đúng** trên thiết bị (Expo + OS lo phần này, app không cần làm gì). Nhưng khi **bấm vào** notification, app **không tự điều hướng** vào đúng kênh chat — phần này bắt buộc phải code ở mobile, backend không can thiệp được.

**Khi có tin nhắn chat mới**, backend gửi push với `data` theo đúng contract sau (khác với ví dụ chung ở 24.1 — đây là dạng dùng riêng cho chat):

```json
{
  "title": "💬 <tên lớp/nhóm>",
  "body": "<tên người gửi>: <nội dung rút gọn, tối đa ~100 ký tự>",
  "data": {
    "type": "chat",
    "referenceId": "grpXXXXXXXXXX",
    "referenceType": "class_chat"
  }
}
```

| Trường `data` | Mô tả |
|---|---|
| `type` | Luôn là `"chat"` cho notification tin nhắn — dùng để phân biệt với các loại push khác (vd. `schedule_change`, lịch học, hoá đơn...) |
| `referenceId` | Chính là **`topicId`** (`grpXXX`) — dùng để subscribe/mở đúng kênh qua Tinode SDK, giống hệt `topicId` ở mục 22.3/22.7/22.8 |
| `referenceType` | `"class_chat"` (chat theo lớp) hoặc `"group_chat"` (nhóm tạo tay **hoặc** chat riêng/DM — **hai loại này dùng chung 1 giá trị**, không tách được qua field này) |

**App cần tự code (dùng `expo-notifications`):**

1. Đăng ký `Notifications.addNotificationResponseReceivedListener(...)` để bắt sự kiện user bấm vào notification (kể cả khi app đang chạy nền).
2. Trong callback, đọc `response.notification.request.content.data`. Nếu `data.type === "chat"` → điều hướng tới màn hình chat, dùng `data.referenceId` để subscribe topic đó.
3. Xử lý riêng trường hợp **cold start** (app bị kill hoàn toàn, user bấm notification để mở lại app) — dùng `Notifications.getLastNotificationResponseAsync()` khi app khởi tạo, vì listener ở bước 1 thường không kịp bắt sự kiện này.
4. Khi app đang **mở sẵn đúng màn hình chat** của `referenceId` đó (foreground) — tin nhắn đã tới qua Tinode WebSocket rồi, cần tự so `referenceId` với topic đang mở để tránh hiện notification trùng / tự tăng badge sai.

> Lưu ý: `referenceType` không phân biệt được nhóm tạo tay và DM (đều là `"group_chat"`). Nếu app cần hiển thị khác nhau khi điều hướng (icon, tiêu đề...), phải tự tra thêm thông tin kênh qua `topicId` sau khi mở, không dựa được vào field này.

---

## Xử lý lỗi

Tất cả endpoint đều trả lỗi theo chuẩn:

```json
{ "message": "Mô tả lỗi bằng tiếng Việt" }
```

| HTTP Status | Ý nghĩa |
|---|---|
| `400` | Dữ liệu đầu vào không hợp lệ |
| `401` | Chưa đăng nhập / token không hợp lệ / hết hạn |
| `403` | Không có quyền (sai loại tài khoản) |
| `404` | Không tìm thấy dữ liệu |
| `500` | Lỗi server |

---

## 25. Dashboard Tổng quan (Staff/Admin)

> Tài liệu đầy đủ xem tại **[docs/mobile-api-dashboard.md](./mobile-api-dashboard.md)**

**Chỉ dành cho nhân viên / quản trị viên.** Học sinh & phụ huynh nhận `403`.

### Query params chung (tất cả đều optional)

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `locationId` | `string` UUID | Lọc theo cơ sở |
| `dateFrom` | `string` `YYYY-MM-DD` | Điểm đầu khoảng thời gian |
| `dateTo` | `string` `YYYY-MM-DD` | Điểm cuối khoảng thời gian |

---

### 25.1 Tab KHÁCH HÀNG — 9 widget

```
GET /api/mobile/dashboard/customers
```

| Widget trên màn hình | Field |
|----------------------|-------|
| Tổng Khách hàng (donut) | `customerSummary.total/hocVien/hocVienPct/phuHuynh/phuHuynhPct` |
| Trạng thái tài khoản (gauge) | `accountStatus.active/activePct/inactive` |
| Khách hàng mới (card) | `newCustomers.today/thisMonth` |
| Trạng thái học tập (bar list) | `learningStatus.dangHoc/baoLuu/choLich/daNghi/chuaCoLich/total` |
| Số lượng HV theo tháng (line) | `monthlyCounts[]` — `monthKey`, `label`, `count`, `growthPct` |
| HV theo Nguồn (pie/bar) | `bySource[]` — `name`, `count`, `pct` |
| HV theo Mối quan hệ (pie) | `byRelationship[]` — `name`, `count`, `color` |
| HV theo Cơ sở (bar) | `byLocation[]` — `name`, `count`, `pct` |
| HV theo Nhân sự (bar) | `byStaff[]` — `name`, `count`, `pct` |

---

### 25.2 Tab ĐÀO TẠO — 7 widget

```
GET /api/mobile/dashboard/training
```

| Widget trên màn hình | Field |
|----------------------|-------|
| Tổng số lớp học (donut Online/Offline) | `formatSummary.total/offline/offlinePct/online/onlinePct` |
| Trạng thái lớp học (bar list) | `statusSummary.active/recruiting/planning/closed/total` |
| Lớp học mới (card) | `newClasses.today/thisMonth` |
| Tổng số lớp theo cơ sở (bar+line) | `byLocation[]` — `locationId`, `locationName`, `total`, `active`, `closed` |
| Tỷ lệ điểm danh theo tháng (bar+line) | `monthlyAttendance[]` — `monthKey`, `label`, `total`, `present`, `rate` |
| Tổng số lớp giáo viên (bar list) | `byTeacher[]` — `name`, `count`, `pct` |
| Tổng số ca dạy giáo viên (bar list) | `byTeacherSessions[]` — `name`, `count`, `pct` |

**Nhãn `statusSummary`:** `active`=Đang hoạt động · `recruiting`=Đang tuyển sinh · `planning`=Lên kế hoạch · `closed`=Đã đóng

---

### 25.3 Tab TÀI CHÍNH — 5 widget

```
GET /api/mobile/dashboard/finance
```

> ⚠️ Tất cả giá trị tiền tệ là **VNĐ** (số nguyên).

| Widget trên màn hình | Field |
|----------------------|-------|
| Tổng hoá đơn (số liệu) | `invoiceSummary.totalCount/totalRevenue/actualCollected/debtAmount` |
| Trạng thái hóa đơn | `invoiceSummary.byStatus.unpaid/partial/paid/debt/cancelled` |
| Thu/Chi kế hoạch vs thực tế | `invoiceSummary.expectedIncome/Expense`, `.actualIncome/Expense`, `.debtIncome/Expense` |
| Phân bổ thu / Phân bổ chi (pie) | `byCategory.income.categories[]`, `byCategory.expense.categories[]` |
| Doanh thu thực theo cơ sở (bar) | `revenueByLocation.rows[]` + `.totals` |
| Công nợ khách hàng (pie/list) | `debtSummary.totalDebtAmount/totalCount`, `.byStatus[]` |

**`byCategory` shape:**
```json
{
  "income":  { "total": 120000000, "categories": [{ "name": "Học phí", "amount": 100000000, "pct": 83.3 }] },
  "expense": { "total":  18000000, "categories": [{ "name": "Lương GV", "amount":  12000000, "pct": 66.7 }] }
}
```

**Nhãn `byStatus`:** `unpaid`=Chưa TT · `partial`=TT một phần · `paid`=Đã TT · `debt`=Công nợ · `cancelled`=Đã huỷ

---

*Tài liệu được tạo ngày 30/06/2026. Liên hệ team backend nếu cần thêm thông tin.*
