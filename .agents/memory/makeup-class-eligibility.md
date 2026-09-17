---
name: Makeup class eligibility
description: Quy tắc tính mức phù hợp của lớp đích khi xếp bù nhiều học viên
---

Khi chọn nhiều học viên để xếp bù sang lớp khác, điểm `x/y` của một lớp phải dựa trên số học viên có thể cùng tham gia trong **một buổi tương lai chung** của lớp đó. `x` là giá trị lớn nhất trên các buổi hợp lệ; không cộng dồn khả năng của các buổi khác nhau. Chỉ lớp đạt `y/y` mới được chọn.

**Why:** Sau khi chọn lớp, nghiệp vụ chỉ chọn một lịch đích chung. Nếu cộng dồn theo từng buổi riêng, giao diện có thể báo `4/4` nhưng không có buổi nào thực sự nhận đủ 4 học viên.

**How to apply:** Giữ mọi lớp dưới `y/y` hiển thị để người dùng tham khảo nhưng làm mờ và vô hiệu hóa. Sau khi chọn được lớp `y/y`, chỉ các buổi đủ điều kiện cho toàn bộ học viên được chọn; buổi thiếu bất kỳ học viên nào phải làm mờ và vô hiệu hóa.

Khi các dòng đang chọn có nhiều buổi cần bù cho cùng một học viên, phần tổng quan phải tách **số học viên duy nhất** khỏi **tổng số buổi cần bù**. Ngày bắt đầu được chọn trước; mỗi phương án lớp/ca chỉ hợp lệ khi toàn bộ học viên dùng được buổi bắt đầu và từng học viên có đủ chuỗi buổi kế tiếp theo số buổi riêng của mình. Buổi hủy được bỏ qua; nếu chuỗi của bất kỳ học viên nào không đủ thì yêu cầu chọn ngày bắt đầu khác.

**Why:** Một học viên có thể nghỉ nhiều buổi, nên kiểm tra chỉ một buổi chung sẽ tạo kế hoạch thiếu hoặc đánh đồng số buổi của các học viên.

**How to apply:** Gửi nhu cầu theo dạng `studentId → số dòng cần bù`, sinh phương án theo từng buổi bắt đầu trong ngày đã chọn, hiển thị xem trước chuỗi buổi của từng học viên, và lưu từng dòng gốc vào một buổi đích tương ứng.

Khi chọn “xếp bù vào lớp hiện tại” mà danh sách có học viên từ nhiều lớp, người dùng phải chọn một lớp nguồn làm lớp đích. Cả “Buổi cụ thể” và “Cuối lịch” đều phải dùng lớp đã chọn; không được mặc định dùng lớp đầu tiên.

**Why:** Một danh sách xếp bù có thể gom nhiều lớp, nên dùng lớp đầu tiên có thể tạo buổi mới hoặc gán buổi vào sai lịch.

**How to apply:** Nạp sessions theo từng lớp nguồn, hiển thị selector khi có từ hai lớp, gửi `selectedCurrentClassId`, và backend xác thực lớp đích thuộc tập lớp của các dòng đang chọn trước khi tạo/gán buổi.