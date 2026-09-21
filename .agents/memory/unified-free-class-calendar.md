---
name: Unified free-class calendar
description: Mô hình giao diện đăng ký và điểm danh lớp tự do trên cùng lưới tháng
---

Lớp tự do dùng một lưới tháng duy nhất: checkbox trong ngày đăng ký hoặc hủy đăng ký; khi đã có bản ghi đăng ký thì hiển thị Select trạng thái điểm danh ngay bên dưới trong cùng ô.

**Why:** Tách tab đăng ký và điểm danh khiến người dùng phải chuyển ngữ cảnh và khó thấy ngày nào đã đăng ký để điểm danh.

**How to apply:** Chỉ cho phép đổi trạng thái qua Select của ô đã đăng ký; ghi chú và nhận xét phải gắn với đúng studentClassId và ngày đăng ký đó. Khi mở tháng hiện tại, ngày hôm nay là ngày được chọn mặc định; chọn một ngày sẽ chọn sẵn các học viên đã đăng ký ngày đó, còn checkbox từng học viên luôn có thể chọn kể cả ngày chưa đăng ký. Đăng ký hàng loạt áp dụng cho toàn bộ học viên được tích; điểm danh hàng loạt chỉ áp dụng cho các học viên đã có đăng ký trong ngày.