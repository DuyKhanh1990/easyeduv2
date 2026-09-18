---
name: Tuition refund expense wallet
description: Quy tắc đồng bộ ví Học phí với Phiếu chi Hoàn học phí đã thanh toán.
---

Phiếu chi có học viên, loại Chi và danh mục Hoàn học phí phải trừ ví Học phí khi đã thanh toán. Với hóa đơn có đợt, số tiền trừ là tổng các đợt đã thanh toán, không phải toàn bộ grand total khi mới thanh toán một phần. Trước mọi thao tác làm tăng số tiền đã hoàn, phải kiểm tra số dư ví và chặn nếu không đủ.

**Why:** Phiếu chi Hoàn học phí là khoản hoàn tiền thực tế; chỉ ghi chi phí trên invoices mà không ghi ledger khiến số dư ví học phí sai. Ledger bất biến nên đổi trạng thái hoặc sửa số tiền phải ghi giao dịch bù, nhưng không được để ví bị trừ vượt số dư.

**How to apply:** Đồng bộ theo net wallet amount của cùng `invoiceId` và category Học phí, đặt mục tiêu âm bằng số tiền đã thanh toán. Khi hủy/đổi danh mục, reconcile về 0; thao tác lặp lại không được tạo debit trùng.