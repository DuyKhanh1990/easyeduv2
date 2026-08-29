---
name: Invoice summary cards
description: Quy ước số liệu cho hàng thẻ tài chính trên trang hóa đơn.
---

Các thẻ Dự thu/Thực thu/Dự chi/Thực chi/Lợi nhuận nằm độc lập với tab trạng thái đang chọn, nhưng dùng chung một tập hóa đơn theo các bộ lọc hiện tại. Dự thu/chi loại hóa đơn hủy và cộng grandTotal; Thực thu/chi cộng paidAmount của chính tập đó, không lọc thêm theo paidAt; Lợi nhuận = Thực thu - Thực chi.

**Why:** Người dùng cần nhìn nhanh toàn cảnh thu-chi ngay cả khi đang xem riêng một tab trạng thái.

**How to apply:** Dùng endpoint summary không truyền `tabFilter`, tính dự thu/chi từ `grandTotal`, thực thu/chi từ `paidAmount` trên cùng tập dữ liệu, và giữ đồng bộ cache với danh sách hóa đơn.