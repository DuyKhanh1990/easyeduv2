---
name: Makeup class eligibility
description: Quy tắc tính mức phù hợp của lớp đích khi xếp bù nhiều học viên
---

Khi chọn nhiều học viên để xếp bù sang lớp khác, điểm `x/y` của một lớp phải dựa trên số học viên có thể cùng tham gia trong **một buổi tương lai chung** của lớp đó. `x` là giá trị lớn nhất trên các buổi hợp lệ; không cộng dồn khả năng của các buổi khác nhau. Chỉ lớp đạt `y/y` mới được chọn.

**Why:** Sau khi chọn lớp, nghiệp vụ chỉ chọn một lịch đích chung. Nếu cộng dồn theo từng buổi riêng, giao diện có thể báo `4/4` nhưng không có buổi nào thực sự nhận đủ 4 học viên.

**How to apply:** Giữ mọi lớp dưới `y/y` hiển thị để người dùng tham khảo nhưng làm mờ và vô hiệu hóa. Sau khi chọn được lớp `y/y`, chỉ các buổi đủ điều kiện cho toàn bộ học viên được chọn; buổi thiếu bất kỳ học viên nào phải làm mờ và vô hiệu hóa.