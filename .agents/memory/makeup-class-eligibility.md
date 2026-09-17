---
name: Makeup class eligibility
description: Quy tắc tính mức phù hợp của lớp đích khi xếp bù nhiều học viên
---

Khi chọn nhiều học viên để xếp bù sang lớp khác, điểm `x/y` của một lớp phải dựa trên số học viên có thể cùng tham gia trong **một buổi tương lai chung** của lớp đó. `x` là giá trị lớn nhất trên các buổi hợp lệ; không cộng dồn khả năng của các buổi khác nhau.

**Why:** Sau khi chọn lớp, nghiệp vụ chỉ chọn một lịch đích chung. Nếu cộng dồn theo từng buổi riêng, giao diện có thể báo `4/4` nhưng không có buổi nào thực sự nhận đủ 4 học viên.

**How to apply:** Giữ lớp `0/y` hiển thị nhưng làm mờ và vô hiệu hóa. Các lớp `x/y` với `x > 0` được chọn; bước chọn buổi tiếp tục hiển thị buổi đủ người, buổi chỉ đủ một phần và buổi bị xung đột.