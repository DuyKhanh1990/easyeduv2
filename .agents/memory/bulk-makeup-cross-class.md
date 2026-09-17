---
name: Bulk makeup across classes
description: Quy tắc xử lý xếp bù hàng loạt khi học viên được chọn từ nhiều lớp gốc.
---

Một thao tác bulk xếp bù có thể chọn học viên từ nhiều lớp gốc. Dialog chọn một lớp/buổi/lịch đích chung, nhưng mỗi học viên vẫn phải giữ `sourceClassId` riêng để tìm đúng `studentClasses`, phiếu buổi gốc, học phí và cập nhật trạng thái buổi nghỉ.

**Why:** Giới hạn lựa chọn trong cùng một lớp khiến tab tổng hợp không đáp ứng mục đích chọn danh sách học viên và xếp chung một lịch. Dùng một `classId` cho toàn bộ học viên làm các học viên thuộc lớp khác bị bỏ qua hoặc gắn sai bản ghi lớp.

**How to apply:** UI truyền `sourceClassId` theo từng học viên và tải `active-students` của từng lớp nguồn để kiểm tra xung đột. API dùng `classId` của dialog làm lớp đích/base, còn storage resolve lớp gốc theo từng student trước khi cập nhật hoặc tạo `student_sessions`.