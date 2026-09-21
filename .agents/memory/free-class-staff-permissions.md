---
name: Free-class staff permissions
description: Staff calendar operations for flexible classes must honor teacher assignment separately from the /classes resource permission.
---

Lớp tự do trong lịch staff cho phép giáo viên được gán ở `classes.teacherIds` hoặc `freeClassRegistrations.teacherId` đọc và thao tác đúng đăng ký/ngày; không được yêu cầu cứng quyền resource `/classes` trước.

**Why:** Giáo viên có thể mở lịch staff theo phân công nhưng không có quyền quản trị danh sách lớp. Kiểm tra `assertClassReadable`/`canEdit` thuần túy khiến điểm danh và nhận xét trả 403 dù giáo viên được phân công.

**How to apply:** Với endpoint lớp tự do, giữ quyền quản trị hiện có nhưng bổ sung kiểm tra staff assignment. Thao tác theo học viên/ngày phải khóa theo `studentClassId + registrationDate`; nhận xét phải khóa theo `registrationId`. Giáo viên không được phân công vẫn phải nhận 403.