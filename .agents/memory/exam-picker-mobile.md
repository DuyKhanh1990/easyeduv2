---
name: Exam picker mobile endpoint
description: ExamPickerDialog dùng sai endpoint, gây danh sách bài kiểm tra rỗng trên mobile staff.
---

## Rule
`ExamPickerDialog` (trong `SessionContentDialog.tsx`) phải gọi `/api/mobile/staff/exams?pageSize=500`, không phải `/api/exams`.

**Why:** `/api/exams` đi qua `locationAccessMiddleware` và filter theo `allowedLocationIds` của staff. Mặc dù exams hiện tại không gán `locationId` (toàn NULL), endpoint này không phù hợp cho mobile staff context. `/api/mobile/staff/exams` là endpoint chuyên dụng, không filter location, trả về toàn bộ bài kiểm tra.

**How to apply:** Bất cứ khi nào cần hiển thị danh sách bài kiểm tra để giáo viên/staff chọn (picker/library), luôn dùng `/api/mobile/staff/exams` kèm `pageSize` lớn và extract `json.items`.

**Schema note:** Bảng `exams` có cột `location_id` (nullable) nhưng thực tế không có exam nào được gán locationId — đây là thiết kế global, không phân theo cơ sở.
