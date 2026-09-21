---
name: Free-class detail cache invalidation
description: Flexible-class staff mutations must refresh the exact staff detail query, not only the month calendar.
---

Sau khi điểm danh, ghi chú hoặc nhận xét lớp tự do, phải cập nhật/invalidate query `/api/my-space/calendar/staff/session/{classSessionId}` cùng với query lịch tháng.

**Why:** Card staff giữ detail query đang active; đóng rồi mở lại có thể dùng object cache cũ dù mutation đã ghi thành công vào database, khiến trạng thái và nhận xét biến mất trên giao diện.

**How to apply:** Mutation free-class cập nhật cache detail theo `studentClassId` hoặc `registrationId`, sau đó invalidate exact query key; không chỉ invalidate `/api/my-space/calendar/staff` hoặc `/free-schedule`.