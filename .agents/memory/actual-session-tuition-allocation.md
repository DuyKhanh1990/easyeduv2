---
name: Class transfer package pricing
description: Quy tắc lấy đơn giá và số buổi theo gói khi chuyển lớp, đồng thời giữ phân bổ học phí đã ghi nhận.
---

Khi chuyển lớp mà các buổi nguồn chưa có phân bổ hóa đơn, điều chỉnh học phí hay giá riêng, dùng tổng giá trong gói chia cho số buổi cấu hình làm mặc định; mẫu số vẫn cho phép nhân viên sửa thủ công. Khuyến mãi cấp gói được chia theo mẫu số đang chọn; thành tiền phần chuyển là đơn giá sau giảm nhân số buổi chuyển. Nếu đã có phân bổ hoặc điều chỉnh, giữ số tiền thực tế đã ghi nhận cho từng buổi.

Không coi `student_sessions.sessionPrice` khác null là bằng chứng học phí riêng đã được áp dụng: lúc đăng ký, trường này cũng được điền bằng giá mặc định của gói. Khi cần phân biệt giá mặc định với giá đã ghi nhận, dựa vào phân bổ hóa đơn hoặc lịch sử điều chỉnh học phí theo buổi; giá lưu khác giá gói có thể là override, nhưng giá trùng gói không chứng minh được nguồn gốc riêng.

**Why:** Tổng gói không phải lúc nào cũng là giá trị của số buổi chuyển. Đơn giá từ tổng gói chia số buổi cấu hình (có thể điều chỉnh thủ công) cho phép chuyển một phần tương ứng mà không chuyển nhầm toàn bộ học phí; phân bổ/điều chỉnh đã lưu vẫn là nguồn dữ liệu thực tế ưu tiên.

**How to apply:** Ưu tiên `invoice_session_allocations.allocated_amount`/`pricing.allocatedFee` và adjustment records đã áp dụng riêng. Khi chưa có các giá trị đó, lấy giá gói chia số buổi cấu hình (hoặc giá mỗi buổi của gói); không suy ra mức giá riêng chỉ từ `sessionPrice` khác null vì trường này cũng có thể chứa giá mặc định. Giữ cùng đơn giá sau giảm cho phần hiển thị và bút toán điều chuyển; lưu giá mới vào buổi nguồn chỉ trong nhánh chưa có giá đã áp dụng. Khi thu tiền, làm tròn chỉ xử lý phần thập phân của đồng: bỏ phần lẻ hoặc làm tròn lên, không tự làm tròn theo 10.000đ/100.000đ.