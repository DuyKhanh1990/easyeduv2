---
name: Calendar color consistency
description: Quy tắc giữ màu lớp nhất quán giữa Schedule và lịch tháng trong My Space.
---

Lịch theo tháng phải ưu tiên màu tùy chỉnh của lớp, dùng cùng bảng màu/hash theo `classId` khi lớp chưa có màu, và chỉ dùng màu đỏ riêng cho buổi đã hủy.

Khi lớp bật tùy chọn “Sử dụng màu theo Gói học phí”, lịch dùng màu hiện tại của gói đã liên kết; nếu tắt thì tiếp tục dùng màu thủ công của lớp. Lớp cũ mặc định không bật tùy chọn này. Nếu gói chưa có màu, giữ màu thủ công của lớp làm phương án dự phòng.

**Why:** Người dùng cần nhận diện cùng một lớp bằng cùng màu ở các màn hình lịch; màu theo hình thức học trực tuyến/ngoại tuyến làm các màn hình bị lệch.

**How to apply:** Khi thêm surface lịch mới hoặc đổi bảng màu, cập nhật bộ màu dùng chung và đảm bảo API trả `classColor` cho session theo đúng nguồn màu đã chọn.