---
name: Free class attendance selection
description: Tách checkbox chọn học viên khỏi điều khiển trạng thái điểm danh
---

Trong bảng điểm danh lớp tự do và chi tiết lịch trên `/schedule`, checkbox đầu dòng phục vụ chọn học viên cho các thao tác khác, không gọi API điểm danh. Trạng thái điểm danh chỉ đổi bằng Select.

**Why:** Checkbox đầu dòng phải được giữ cho thao tác chọn hàng loạt; đồng thời giao diện vẫn cần tự tích học viên khi trạng thái được chuyển sang Có học.

**How to apply:** Khởi tạo danh sách chọn từ các học viên đã `attended`, thêm học viên vào danh sách khi Select chuyển sang `attended`, và để thao tác checkbox chỉ cập nhật state chọn.