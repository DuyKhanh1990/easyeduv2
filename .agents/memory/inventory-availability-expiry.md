---
name: Inventory availability expiry
description: Quy tắc nhất quán khi tính tồn khả dụng từ giao dịch kho, reservation và phiếu xuất nháp.
---

Tồn thực tế lấy từ tổng biến động trong `store_stock_transactions`; không ghi reservation thành biến động tồn. Tồn khả dụng = tồn thực tế - reservation còn hạn - phiếu xuất nháp còn hạn theo `draftMinutes`. Reservation hết hạn phải được xóa; phiếu nháp hết hạn bị loại khỏi phần giữ chỗ. Khi cập nhật reservation của cùng session, không trừ giữ chỗ hiện tại của session đó lần nữa.

**Why:** Người dùng yêu cầu giữ tồn vật lý và giữ chỗ là hai đại lượng riêng; chỉ giữ chỗ hợp lệ mới làm giảm khả dụng, còn giữ chỗ hết hạn phải được nhả để không giữ hàng sai.

**How to apply:** Dùng cùng `store_reservation_config.draft_minutes` cho trang tồn kho, endpoint tìm hàng, reservation creation, sửa phiếu xuất, hủy/giảm phiếu nhập và chuyển kho; loại trừ reservation của session và phiếu đang sửa khi phù hợp. Không sửa ledger khi một reservation hết hạn.