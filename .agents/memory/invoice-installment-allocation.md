---
name: Invoice installment allocation
description: Quy tắc bảo toàn tổng tiền, sửa phân bổ và tách đợt trong dialog hóa đơn.
---

Khi lịch thanh toán đã được bắt đầu, tổng tiền đã thanh toán trực tiếp và các đợt phải luôn bằng tổng hóa đơn. Phần còn thiếu được tạo hoặc cập nhật thành một đợt chưa thanh toán còn lại. Chỉ xóa đợt chưa thanh toán khi còn một đợt chưa thanh toán khác để nhận toàn bộ số tiền; đợt đã thanh toán không bao giờ là đợt đích. Đợt cuối chỉ được xóa cùng hóa đơn khi hóa đơn và đợt đó đều chưa thanh toán.

**Why:** Người dùng có thể quên tạo đợt cho phần tiền còn thiếu; đồng thời lịch sử của các đợt đã thanh toán không được thay đổi. Người dùng xác nhận xóa đợt là thao tác dồn tiền giữa các đợt chưa thanh toán, còn xóa đợt cuối sẽ xóa toàn bộ hóa đơn.

**How to apply:** Nút Thêm chỉ khởi tạo đợt đầu. Sửa số tiền chỉ cân sang đợt chưa thanh toán khác; nếu chưa có lịch sử thanh toán và chỉ có một đợt thì có thể tự sinh đợt còn lại. Khi chỉ còn một đợt chưa thanh toán sau các đợt đã trả, khóa sửa trực tiếp và dùng Tách đợt. Tách chỉ áp dụng cho đợt chưa thanh toán, chuyển một phần tiền sang đợt mới và giữ nguyên tổng hóa đơn. Khi xóa, đếm các đợt có status `unpaid`, chọn đích trong chính tập đó, và chỉ xóa toàn bộ hóa đơn nếu còn tối đa một đợt, mọi trạng thái liên quan đều `unpaid`.