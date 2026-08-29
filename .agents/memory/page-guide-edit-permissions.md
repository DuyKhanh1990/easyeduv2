---
name: Page guide edit permissions
description: Quy tắc lưu và chỉnh sửa tài liệu hướng dẫn theo từng trang.
---

Tài liệu hướng dẫn dùng nội dung riêng theo từng đường dẫn trang; chỉ host gốc `easyeduv2.easyedu.vn` và tài khoản Super Admin được sửa, các host khác chỉ đọc nội dung lấy từ host gốc.

**Why:** Tài liệu phải dùng chung giữa các cơ sở/nhà cung cấp nhưng không cho tài khoản tenant thay đổi nội dung chuẩn của hệ thống.

**How to apply:** Khi thêm trang mới có nút tài liệu, dùng page-guide chung; luôn kiểm tra quyền ở server, không chỉ ẩn nút Sửa ở giao diện.