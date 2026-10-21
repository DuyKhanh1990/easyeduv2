---
name: Customer status card source
description: Nguồn dữ liệu và phạm vi áp dụng cho các thẻ trạng thái học viên trên trang khách hàng.
---

Các thẻ trạng thái trên `/customers` phải tổng hợp theo ghi danh lớp trong `student_classes`, với mỗi học viên chỉ được tính một lần dù có nhiều lớp. “Sắp hết lịch” phải khớp tiêu chí của nhãn dưới tên: ghi danh đang hoạt động, còn tối đa 10 buổi, lịch kết thúc từ hôm qua trở đi.

**Why:** Người dùng xác nhận khoảng ngày bắt đầu/kết thúc và trạng thái ghi danh theo từng lớp là nguồn phù hợp nhất cho các thẻ; suy luận từ `student_sessions` từng làm thẻ “Đang học” lệch với thông tin lớp đang hiển thị. Thẻ “Sắp hết lịch” cần khớp nhãn hiện có và không đếm trùng học viên có nhiều lớp.

**How to apply:** Giữ logic này riêng cho các thẻ `/customers`. Không tự động thay đổi logic báo cáo, bộ lọc trạng thái hoặc nhãn trạng thái từng dòng nếu người dùng không yêu cầu rõ.