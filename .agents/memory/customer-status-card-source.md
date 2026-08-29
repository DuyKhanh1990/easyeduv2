---
name: Customer status card source
description: Nguồn dữ liệu và phạm vi áp dụng cho các thẻ trạng thái học viên trên trang khách hàng.
---

Các thẻ Tổng, Đang học, Chưa có lịch, Bảo lưu và Đã nghỉ trên `/customers` phải tổng hợp theo ghi danh lớp trong `student_classes`, với mỗi học viên chỉ được tính một lần dù có nhiều lớp.

**Why:** Người dùng xác nhận khoảng ngày bắt đầu/kết thúc và trạng thái ghi danh theo từng lớp là nguồn phù hợp nhất cho các thẻ; suy luận từ `student_sessions` từng làm thẻ “Đang học” lệch với thông tin lớp đang hiển thị.

**How to apply:** Giữ logic này riêng cho các thẻ `/customers`. Không tự động thay đổi logic báo cáo, bộ lọc trạng thái hoặc nhãn trạng thái từng dòng nếu người dùng không yêu cầu rõ.