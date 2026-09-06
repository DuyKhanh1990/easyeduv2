---
name: Invoice installment allocation
description: Quy tắc bảo toàn tổng tiền, sửa phân bổ và tách đợt trong dialog hóa đơn.
---

Khi lịch thanh toán đã được bắt đầu, tổng tiền đã thanh toán trực tiếp và các đợt phải luôn bằng tổng hóa đơn. Phần còn thiếu được tạo hoặc cập nhật thành một đợt chưa thanh toán còn lại.

**Why:** Người dùng có thể quên tạo đợt cho phần tiền còn thiếu; đồng thời lịch sử của các đợt đã thanh toán không được thay đổi.

**How to apply:** Nút Thêm chỉ khởi tạo đợt đầu. Sửa số tiền chỉ cân sang đợt chưa thanh toán khác; nếu chưa có lịch sử thanh toán và chỉ có một đợt thì có thể tự sinh đợt còn lại. Khi chỉ còn một đợt chưa thanh toán sau các đợt đã trả, khóa sửa trực tiếp và dùng Tách đợt. Tách chỉ áp dụng cho đợt chưa thanh toán, chuyển một phần tiền sang đợt mới và giữ nguyên tổng hóa đơn.