---
name: Evaluation criterion input types
description: Quy tắc thống nhất cho tiêu chí đánh giá dạng nhập text và tickbox
---

Một bộ tiêu chí có thể chứa các dòng `heading` làm tiêu đề nhóm và các dòng `criterion` làm tiêu chí đánh giá. Dòng `criterion` có loại riêng: `text` để giáo viên nhập nhận xét hoặc `checkbox` để giáo viên tick khi học viên đạt tiêu chí.

Checkbox tiêu chí con có thể có mã loại trừ tùy chọn. Trong câu trả lời của một học viên cho một bảng đánh giá, các checkbox có cùng mã khác rỗng chỉ được chọn một, kể cả ở các nhóm khác nhau. Tiêu chí đang chọn vẫn cho phép bỏ chọn; API phải từ chối lưu nếu dữ liệu có xung đột.

**Why:** Dùng lại bảng tiêu chí con với quan hệ cha-con giúp một bộ tiêu chí duy nhất chứa nhiều tiêu đề nhóm, tránh tạo nhiều tiêu chí cha độc lập khó kiểm soát.

**How to apply:** Dòng không có nhóm khi tạo mới trở thành `heading`; dòng chọn nhóm trở thành `criterion`. Tiêu chí cũ vẫn là `criterion` dạng text để tương thích. API review phải giữ `inputType` và `checked`: checkbox hiển thị ô đã/chưa tick, text hiển thị nội dung nhận xét. Mọi màn hình học viên (chi tiết học viên, learning overview, my-space calendar) lấy `groupName` làm tiêu đề nhóm, sắp xếp nhóm/con theo thứ tự cấu hình, gom nhóm trước khi render và chỉ hiển thị một `criteriaRating` tổng ở đầu, không lặp tên tiêu chí con. Trong form bảng điểm mẫu, phần xem trước của tiêu chí đã chọn cần hiển thị nhóm, các tiêu chí con và kiểu nhập để người dùng xác nhận nội dung trước khi lưu.

**How to apply:** Chỉ hiển thị/sửa mã loại trừ trên tiêu chí con checkbox; xóa mã khi chuyển thành text hoặc heading; kiểm tra trùng mã trên toàn bộ bảng theo từng học viên ở cả giao diện và API.