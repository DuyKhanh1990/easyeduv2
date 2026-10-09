---
name: Past schedule access
description: Product rules for role-based access to historical class sessions.
---

Quyền chạy lịch trong quá khứ luôn bật cho nhân sự. Danh sách loại trừ mặc định trống, nên staff hiện có không bị khóa sau khi triển khai. Chỉ các vai trò staff được chọn trong danh sách “Vai trò không được phép” mới bị chặn. Phòng Khách hàng (phụ huynh, học viên) không tham gia danh sách và không được chạy lịch quá khứ.

Một cấu hình allowlist cũ (`enabled`/`roleIds`) phải được đọc như blacklist trống để không đổi quyền staff khi chuyển sang mô hình mới. Ngày quá khứ là ngày trước hôm nay theo `Asia/Bangkok`; hôm nay vẫn được phép. “Gia hạn” không thuộc phạm vi tính năng. Với xếp buổi bù, buổi nguồn có thể ở quá khứ nhưng buổi đích không bao giờ được ở quá khứ.

**Why:** Việc thêm cấu hình không được làm mất khả năng mà staff đang có; blacklist chỉ cần dùng cho các vai trò muốn hạn chế.

**How to apply:** Giữ switch luôn bật, lọc vai trò Phòng Khách hàng ở giao diện và từ chối chúng phía server. Dùng cùng quy tắc ngày Bangkok ở mọi giao diện và mutation; giữ ngoại lệ buổi nguồn bù riêng với điều kiện bắt buộc của buổi đích.
