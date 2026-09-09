---
name: Debt view installment truth
description: Quy tắc xác định công nợ và hạn thanh toán khi hóa đơn có nhiều đợt.
---

Trang công nợ phải coi số tiền còn nợ là tổng hóa đơn trừ tổng các đợt đã thanh toán; hạn và tình trạng phải lấy từ đợt chưa thanh toán sớm nhất, còn hóa đơn không có lịch thì dùng dữ liệu hóa đơn.

**Why:** Dữ liệu cũ có thể giữ `remaining_amount` dương dù tất cả đợt đã trả, và hạn của hóa đơn gốc có thể khác hạn của các đợt.

**How to apply:** Khi lọc backend công nợ, loại hóa đơn đã thanh toán hết các đợt và không dựa riêng vào cột denormalized. Ở giao diện, hiển thị từng đợt chưa trả, tính thẻ/lọc theo `scheduleNextDueDate`, và chỉ hiển thị tình trạng ở cột từng dòng.