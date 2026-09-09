---
name: Inventory availability expiry
description: Quy tắc nhất quán khi tính tồn khả dụng từ giao dịch kho, reservation và phiếu xuất nháp.
---

Tồn thực tế lấy từ tổng biến động trong `store_stock_transactions`; tồn khả dụng trừ reservation còn hạn và phiếu xuất ở trạng thái nháp có `updated_at` nằm trong `draftMinutes`. Reservation hoặc phiếu nháp hết hạn không được giữ chỗ.

**Why:** Nếu endpoint danh sách tồn kho lọc hạn nhưng dialog bán hàng hoặc bước hoàn tất phiếu không lọc, cùng một sản phẩm sẽ hiển thị số lượng khác nhau và có thể bị từ chối hoặc cho xuất sai.

**How to apply:** Dùng cùng `store_reservation_config.draft_minutes` cho trang tồn kho, các endpoint tìm sản phẩm và kiểm tra trước khi hoàn tất phiếu xuất; vẫn loại trừ reservation của session và phiếu đang sửa khi nghiệp vụ cần.