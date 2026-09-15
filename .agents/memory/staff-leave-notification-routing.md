---
name: Staff leave notification routing
description: Quy tắc gửi notification cho đơn nghỉ phép của nhân sự.
---

Đơn nghỉ phép do nhân sự tự tạo gửi đến các tài khoản nhân sự có quyền xem/quản lý `/don-tu` trong cùng cơ sở; không gửi lại cho người tạo. Khi duyệt hoặc từ chối, chỉ gửi về tài khoản của nhân sự tạo đơn.

**Why:** Người tạo cần nhận trạng thái riêng, còn người duyệt phải nhận đúng phạm vi cơ sở thay vì toàn bộ nhân sự.

**How to apply:** Giữ `referenceType` là `staff_leave_request`; notification gửi đến người duyệt dùng deeplink `StaffLeaveRequestManagement`, còn notification trạng thái gửi về người tạo dùng deeplink `StaffMyLeaveRequests`. Đơn nghỉ học viên/phụ huynh mới dùng `StaffLeaveRequests`.