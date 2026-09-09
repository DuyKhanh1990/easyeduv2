---
name: Bulk finance child-first behavior
description: Quy tắc cho các thao tác hàng loạt khi hóa đơn được hiển thị theo các đợt thanh toán.
---

Các thao tác hàng loạt phải truyền riêng danh sách hóa đơn thường và `scheduleIds`; thao tác trên đợt con không được tự động chuyển thành thao tác trên hóa đơn cha. Khi cập nhật hoặc thu một đợt, phải đồng bộ các trường tổng hợp của hóa đơn cha từ toàn bộ các đợt.

**Why:** Dữ liệu nhiều đợt có trạng thái, số tiền và ngày nghiệp vụ ở cấp đợt. Nếu bỏ qua danh sách đợt hoặc chỉ cập nhật đợt mà không đồng bộ cha, giao diện công nợ và trạng thái hóa đơn sẽ sai hoặc im lặng không thay đổi.

**How to apply:** Dùng một mảng duy nhất khi gọi `Promise.all`; kiểm tra cả API invoice và schedule trong bulk status/date/collect; không dùng `Promise.all(a, b)` vì đối số thứ hai bị JavaScript bỏ qua.