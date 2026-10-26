---
name: Multi-installment parent and child invoice model
description: The parent record groups child invoices; each child is the financial record.
---

Với hóa đơn nhiều đợt, hóa đơn cha chỉ là bản ghi nhóm/liên kết ngầm, không hiển thị trong danh sách; các dòng con là mục người dùng thao tác và tham gia thanh toán. Quy tắc xóa đã được người dùng xác nhận: chỉ xóa dòng chưa thanh toán; nếu nhóm còn nhiều đợt thì phải có một đợt chưa thanh toán khác nhận tiền và dồn toàn bộ số tiền vào đợt chưa thanh toán cuối cùng. Khi chỉ còn một đợt, xóa đợt sẽ xóa hóa đơn cha ẩn cùng đợt đó, chỉ khi cả hai ở trạng thái chưa thanh toán.

**Why:** Người dùng xác nhận nghiệp vụ xóa phải thao tác từ từng dòng con theo các điều kiện này; cha không phải mục thanh toán hiển thị, nhưng vẫn là bản ghi nhóm bị xóa khi xóa đợt cuối.

**How to apply:** Hiển thị thao tác xóa trên từng dòng con khi quyền và điều kiện trạng thái/đợt nhận tiền cho phép; dùng ID đợt cho nhóm nhiều đợt và luồng xóa hóa đơn hiện có cho đợt cuối. Không đưa thao tác xóa chỉ lên dòng cha ẩn.