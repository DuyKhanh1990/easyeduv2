---
name: Student discussion edit audit
description: Quy tắc lưu và hiển thị người chỉnh sửa thảo luận học viên
---

## Rule
Khi chỉnh sửa thảo luận học viên, không thay đổi người tạo ban đầu. Lưu người sửa vào trường riêng và cập nhật thời điểm sửa; chỉ hiển thị dòng audit khi comment đã từng được chỉnh sửa.

**Why:** Người xem cần phân biệt tác giả gốc với nhân sự chỉnh sửa, đồng thời các comment cũ không nên bị coi là đã chỉnh sửa chỉ vì có trường `updatedAt`.

**How to apply:** API cập nhật phải ràng buộc cả `commentId` và `studentId`, ghi `updatedBy` cùng `updatedAt`, còn API đọc cần trả tên tác giả và người sửa để UI hiển thị ghi chú audit.