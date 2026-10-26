---
name: Multi-installment parent and child invoice model
description: The parent record groups child invoices; each child is the financial record.
---

Với hóa đơn nhiều đợt, hóa đơn cha chỉ là bản ghi nhóm/liên kết ngầm. Các hóa đơn con mới là chứng từ tài chính thực tế: mỗi hóa đơn con tự tham gia thanh toán và là nguồn chuẩn cho số tiền, trạng thái và thao tác nghiệp vụ của chính nó. Không dùng trạng thái/tổng tiền của cha để quyết định thanh toán hay xóa hóa đơn con; không tự dồn tiền giữa các hóa đơn con hoặc xóa cha khi xóa con nếu chưa có quy tắc riêng được người dùng xác nhận.

**Why:** Người dùng làm rõ rằng hóa đơn cha chỉ giữ liên kết nhóm; hóa đơn con mới tham gia thanh toán. Cách hiểu cũ coi các dòng con là phần phân bổ của hóa đơn cha dẫn đến suy luận sai về điều kiện xóa.

**How to apply:** Khi đọc hoặc sửa phân hệ này, lần theo ID của hóa đơn con trong CRUD, thanh toán, quyền, lọc, đối soát và xóa. Cha chỉ dùng để nhóm/liên kết hoặc hiển thị thông tin tổng hợp; không để thao tác trên cha ghi đè dữ liệu tài chính của con. Xác minh với người dùng trước mọi thao tác dây chuyền giữa các hóa đơn con.