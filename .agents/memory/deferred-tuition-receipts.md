---
name: Deferred tuition receipts
description: Quyết định nghiệp vụ cho việc in phiếu thu từ dữ liệu học phí trả sau.
---

Phiếu thu học phí trả sau được tạo từ dialog nhanh, dựng trên các buổi có tính phí trong tháng và ghi thành phiếu thu thật qua API hóa đơn. Dialog cho phép để trống tiền thu (phiếu chưa thanh toán), thu đủ hoặc thu một phần; payload lấy cơ sở từ lớp và gộp các buổi cùng gói thành một item có số lượng. Khi thu một phần, hóa đơn gốc phải có hai đợt con: đợt đã thu và đợt còn lại để thu tiếp ở Invoices. Hóa đơn không có bản ghi lịch thanh toán vẫn được coi là một đợt trong giao diện chi tiết. Trạng thái nút dựa trên việc đã tạo phiếu cho học viên/lớp/tháng, không chỉ dựa trên trạng thái thanh toán.

**Why:** Nút “Phiếu thu” là thao tác thu tiền trực tiếp giống dialog Tổng lương, không phải thao tác in bản xem trước. Thu đủ dùng trạng thái paid; thu thấp hơn tổng dùng trạng thái partial.

**How to apply:** Khi mở rộng tính năng này, giữ payload gắn học viên, lớp, cơ sở, danh mục Học phí và các item gói có `unitPrice × quantity`; giữ định danh tháng của phiếu để nhận diện đã tạo sau khi tải lại. Nếu bổ sung đánh dấu session đã thanh toán, cần thiết kế liên kết invoice-session riêng để tránh ghi nhận sai khi thu một phần.