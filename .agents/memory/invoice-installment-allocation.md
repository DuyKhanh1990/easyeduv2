---
name: Multi-installment parent and child invoice model
description: The parent record groups child invoices; each child is the financial record.
---

Với hóa đơn nhiều đợt, hóa đơn cha chỉ là bản ghi nhóm/liên kết ngầm, không hiển thị trong danh sách; các dòng con là mục người dùng thao tác và tham gia thanh toán. Chỉ xóa dòng chưa thanh toán khi có ít nhất hai đợt chưa thanh toán; tiền của đợt bị xóa được dồn vào đợt chưa thanh toán phía trước. Nếu chỉ còn một đợt chưa thanh toán nhưng các đợt khác đã thanh toán thì không cho xóa. Chỉ khi toàn nhóm còn đúng một đợt chưa thanh toán thì xóa đợt đó mới xóa luôn hóa đơn cha ẩn.

**Why:** Người dùng xác nhận nghiệp vụ xóa phải thao tác từ từng dòng con và số tiền dồn về đợt chưa thanh toán phía trước; không nhầm “một đợt chưa thanh toán” với “chỉ còn một đợt trong nhóm”.

**How to apply:** Hiển thị thao tác xóa trên từng dòng con khi quyền và điều kiện trạng thái/đợt nhận tiền cho phép; dùng ID đợt cho nhóm nhiều đợt và luồng xóa hóa đơn hiện có khi chỉ còn một đợt tổng cộng. Khi dồn tiền, tìm đợt chưa thanh toán đứng trước dòng bị xóa, không chọn đợt cuối một cách cố định.