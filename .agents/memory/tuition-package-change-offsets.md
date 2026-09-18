---
name: Tuition package change offsets
description: Quy tắc bù trừ và giá hiệu lực khi đổi gói học phí theo khoảng buổi.
---

Đổi gói chỉ thay giá các buổi trong khoảng; buổi ngoài khoảng và phân bổ hóa đơn cũ giữ nguyên. Chênh lệch bằng tổng giá mới trừ tổng giá hiệu lực cũ: dương tạo Phiếu thu Học phí, âm tạo Phiếu chi Hoàn học phí, bằng 0 không tạo phiếu. Việc tạo phiếu chỉ xảy ra khi người dùng bật switch hóa đơn tự động; mặc định chỉ đổi gói.

Giá sau mỗi lần đổi là một override tuyệt đối, bất biến theo lịch sử và có thứ tự áp dụng tăng dần do database cấp. Mọi nơi đọc giá buổi phải ưu tiên override mới nhất, rồi mới fallback sang tổng phân bổ hóa đơn hoặc session price.

**Why:** Tái phân bổ gói cũ làm thay đổi các buổi ngoài phạm vi và có thể chồng tiền khi một buổi nhận nhiều hóa đơn. Offset tương đối cũng gây cộng hai lần ở buổi chưa có allocation và sai khi đổi gói nhiều lần.

**How to apply:** Gói buổi áp dụng giảm/phụ thu trên từng buổi; gói khóa áp dụng một lần trên tổng rồi chia cent xác định cho các buổi chọn. Operation key phải unique toàn yêu cầu. Buổi đã trừ ví reconcile delta ngay; buổi pending không chạm ví. Nội dung hóa đơn mặc định nêu gói cũ/mới, số buổi và ngày dd/mm/yyyy, nhưng giữ nội dung người dùng sửa khi tạo phiếu.