---
name: Calendar color consistency
description: Quy tắc giữ màu lớp nhất quán giữa Schedule và lịch tháng trong My Space.
---

Lịch theo tháng phải ưu tiên màu tùy chỉnh của lớp, dùng cùng bảng màu/hash theo `classId` khi lớp chưa có màu, và chỉ dùng màu đỏ riêng cho buổi đã hủy.

**Why:** Người dùng cần nhận diện cùng một lớp bằng cùng màu ở các màn hình lịch; màu theo hình thức học trực tuyến/ngoại tuyến làm các màn hình bị lệch.

**How to apply:** Khi thêm surface lịch mới hoặc đổi bảng màu, cập nhật bộ màu dùng chung và đảm bảo API trả `classColor` cho session.