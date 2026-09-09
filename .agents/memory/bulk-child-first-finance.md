---
name: Bulk finance child-first behavior
description: Quy tắc cho các thao tác hàng loạt khi hóa đơn được hiển thị theo các đợt thanh toán.
---

Các thao tác hàng loạt phải truyền riêng danh sách hóa đơn thường và `scheduleIds`; thao tác trên đợt con không được tự động chuyển thành thao tác trên hóa đơn cha. Khi cập nhật hoặc thu một đợt, phải đồng bộ các trường tổng hợp của hóa đơn cha từ toàn bộ các đợt.

**Why:** Dữ liệu nhiều đợt có trạng thái, số tiền và ngày nghiệp vụ ở cấp đợt. Nếu bỏ qua danh sách đợt hoặc chỉ cập nhật đợt mà không đồng bộ cha, giao diện công nợ và trạng thái hóa đơn sẽ sai hoặc im lặng không thay đổi.

**How to apply:** Dùng một mảng duy nhất khi gọi `Promise.all`; kiểm tra cả API invoice và schedule trong bulk status/date/collect; không dùng `Promise.all(a, b)` vì đối số thứ hai bị JavaScript bỏ qua.

Tab và tổng số cuối danh sách phải đếm theo các dòng người dùng nhìn thấy: hóa đơn thường là một mục, hóa đơn có nhiều đợt là số đợt. Có thể giữ riêng số hóa đơn cha cho phân trang nội bộ.

**Why:** Người dùng chọn và thao tác trên từng đợt con, nên hiển thị số hóa đơn cha cạnh số mục đã chọn gây cảm giác mất hóa đơn.

**How to apply:** Khi thêm bộ lọc hoặc tab tài chính, phân biệt `parentTotal` dùng cho phân trang với `total`/tab count dùng cho các dòng child-first.