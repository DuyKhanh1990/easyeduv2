---
name: Bulk finance child-first behavior
description: Quy tắc thao tác trên hóa đơn con trong chế độ danh sách gộp.
---

Hóa đơn con là các chứng từ thanh toán thực tế; hóa đơn cha chỉ nhóm/liên kết chúng. Thao tác hàng loạt phải giữ đúng ID từng hóa đơn con, không biến thành thao tác trên cha và không yêu cầu đồng bộ cha như nguồn tài chính.

**Why:** Người dùng làm rõ rằng chỉ hóa đơn con tham gia thanh toán; cha không quyết định số tiền hoặc trạng thái của con.

**How to apply:** Bulk delete/status/payment and row counts must target the visible child invoice IDs. Keep any parent use limited to grouping and informational display. Use one combined array for `Promise.all`; avoid `Promise.all(a, b)`, which silently ignores its second argument.

Tab và tổng số cuối danh sách phải đếm theo các dòng người dùng nhìn thấy: hóa đơn thường là một mục, hóa đơn có nhiều đợt là số đợt. Có thể giữ riêng số hóa đơn cha cho phân trang nội bộ.

**Why:** Người dùng chọn và thao tác trên từng đợt con, nên hiển thị số hóa đơn cha cạnh số mục đã chọn gây cảm giác mất hóa đơn.

**How to apply:** Khi thêm bộ lọc hoặc tab tài chính, phân biệt `parentTotal` dùng cho phân trang với `total`/tab count dùng cho các dòng child-first.

Khi nhập trực tiếp, `createdAt` của hóa đơn/đợt phải lấy theo ngày thanh toán nếu người dùng đã nhập ngày đó; dòng chưa thanh toán không có ngày thanh toán và dùng ngày hiện tại mặc định.

**Why:** Ngày tạo nghiệp vụ của dữ liệu nhập cũ có thể chính là ngày đã thu tiền, trong khi các đợt chưa thu phải phản ánh thời điểm lập phiếu hiện tại.

**How to apply:** Gửi `createdAt` riêng cho từng schedule có `paymentDate`; schema API phải coerce chuỗi ngày từ input date trước khi insert.