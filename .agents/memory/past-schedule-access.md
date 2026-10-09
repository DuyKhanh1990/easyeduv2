---
name: Past schedule access
description: Product rules for role-based access to historical class sessions.
---

Khi cấu hình bật “Chạy lịch học trong quá khứ”, chỉ các vai trò được chọn mới được thao tác trên buổi có ngày trước ngày hiện tại tại `Asia/Bangkok`. Hôm nay vẫn được phép. Cấu hình mặc định tắt và không có vai trò được chọn.

“Gia hạn” không thuộc phạm vi tính năng. Với xếp buổi bù, buổi nguồn có thể ở quá khứ nhưng buổi đích không bao giờ được ở quá khứ.

**Why:** Nhiều thao tác lịch học có thể được gọi trực tiếp qua API; ẩn hoặc vô hiệu hóa lựa chọn trên giao diện không đủ để bảo vệ dữ liệu.

**How to apply:** Dùng cùng quy tắc ngày Bangkok ở giao diện và kiểm tra quyền phía server cho từng mutation. Giữ ngoại lệ của buổi nguồn bù riêng với điều kiện bắt buộc của buổi đích.
