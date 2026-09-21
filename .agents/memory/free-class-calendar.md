---
name: Free class calendar model
description: Durable business rule for flexible classes with no fixed weekly sessions
---

Lớp tự do không sinh `class_sessions` cố định. Mỗi học viên có khoảng thời gian và số buổi riêng trong `student_classes`; mỗi ngày đăng ký được lưu thành một bản ghi riêng. Trạng thái `registered` chỉ giữ chỗ, còn `attended` mới cộng `attendedSessions` và trừ `remainingSessions`.

**Why:** Học viên có thể chọn ngày bất kỳ trong thời hạn, nên dùng lịch tuần cố định sẽ làm học viên xuất hiện sai trên lịch giáo viên và trừ buổi trước khi thực tế đến học.

**How to apply:** Các thay đổi cho lớp tự do phải giữ hai thao tác độc lập là đăng ký ngày và điểm danh. Không đưa các ngày đăng ký vào `student_sessions` hoặc dùng chúng để tính đã sử dụng; khi mở tự đăng ký cho học viên, tái sử dụng cùng bản ghi ngày và giữ kiểm tra giới hạn số buổi/thời hạn ở backend.

Lịch tổng `/schedule` phải chiếu mỗi cặp lớp/ngày có đăng ký thành một buổi tổng hợp, kèm danh sách học viên của ngày đó. Điểm danh tại buổi dùng hai trạng thái nghiệp vụ: `Có học` (`attended`) và `Bảo lưu` (`registered`).

**Why:** Lớp tự do không có ca cố định nhưng giáo viên vẫn cần thấy đúng buổi đã đăng ký trong lịch chung và thao tác điểm danh theo từng buổi như lớp thường.

**How to apply:** Không tạo `class_sessions` giả trong database; tổng hợp buổi ở API lịch và cập nhật lại bản ghi đăng ký hiện có khi giáo viên tick/bỏ tick.