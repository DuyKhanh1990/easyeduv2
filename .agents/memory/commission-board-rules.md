---
name: Commission board rules
description: Quy tắc nghiệp vụ để lọc và tính hoa hồng từ cấu hình hoa hồng.
---

Bảng hoa hồng phải tính từ các cấu hình đang áp dụng, không chỉ đọc các dòng hoa hồng thủ công trên hóa đơn. Chỉ hai trạng thái Chưa thanh toán và Đã thanh toán được hỗ trợ; hóa đơn chưa thanh toán dùng ngày tạo, hóa đơn đã thanh toán dùng ngày thanh toán. Khi cấu hình chọn cả hai trạng thái, thứ tự hóa đơn đầu tiên/thứ 2 trở đi phải xếp chung theo ngày nghiệp vụ của học viên. Với vai trò Người Gán hoa hồng, doanh thu tính hoa hồng là Tổng tiền hóa đơn × tỷ lệ của người đó trên hóa đơn / 100; các vai trò CRM và Người tạo hóa đơn vẫn dùng toàn bộ Tổng tiền hóa đơn. Các cấu hình cùng khớp được cộng dồn, nên một hóa đơn có thể tạo nhiều khoản hoa hồng cho cùng nhân sự.

**Why:** Người dùng xác nhận hoa hồng có thể cộng nhiều lần theo cấu hình và thứ tự phải phản ánh ngày nghiệp vụ, không phải tách riêng theo loại trạng thái; tỷ lệ gán riêng trên hóa đơn phải giới hạn doanh thu của Người Gán hoa hồng.

**How to apply:** Khi thay đổi API hoặc giao diện bảng hoa hồng, giữ nguyên việc lọc theo cơ sở, danh mục, trạng thái và thời hạn cấu hình; ánh xạ Sale/Phụ trách/Giáo viên từ hồ sơ học viên, Người tạo hóa đơn từ người tạo, và Người Gán hoa hồng từ danh sách nhân sự trong hóa đơn.