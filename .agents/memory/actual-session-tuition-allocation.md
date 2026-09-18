---
name: Actual session tuition allocation
description: Quy tắc tính học phí gói khóa khi số buổi đăng ký thực tế khác số buổi cấu hình của gói.
---

Với gói khóa, `course_fee_packages.sessions` là số buổi cấu hình tham chiếu. Khi học viên đăng ký số buổi thực tế khác số này, học phí áp dụng từng buổi và phần giảm trừ từng buổi phải lấy theo phân bổ của hóa đơn trên số buổi thực tế. Tổng sau giảm là tổng các khoản phân bổ, không được lấy một khoản giảm đã chia theo invoice quantity rồi nhân lại với số buổi cấu hình của gói.

**Why:** Một gói 5.000.000đ cấu hình 20 buổi có thể được đăng ký thực tế 49 buổi; trong trường hợp đó hóa đơn phân bổ 4.500.000đ trên 49 buổi, tương đương 91.836,73đ/buổi.

**How to apply:** Ở các màn hình hiển thị hoặc tính chuyển lớp, ưu tiên `invoice_session_allocations.allocated_amount`/`pricing.allocatedFee` cho học viên đã có hóa đơn. Giữ package total và tổng promotion theo hóa đơn; chỉ dùng giá gói làm fallback khi chưa có allocation.