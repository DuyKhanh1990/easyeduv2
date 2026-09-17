---
name: Evaluation criterion input types
description: Quy tắc thống nhất cho tiêu chí đánh giá dạng nhập text và tickbox
---

Một bộ tiêu chí có thể chứa các dòng `heading` làm tiêu đề nhóm và các dòng `criterion` làm tiêu chí đánh giá. Dòng `criterion` có loại riêng: `text` để giáo viên nhập nhận xét hoặc `checkbox` để giáo viên tick khi học viên đạt tiêu chí.

**Why:** Dùng lại bảng tiêu chí con với quan hệ cha-con giúp một bộ tiêu chí duy nhất chứa nhiều tiêu đề nhóm, tránh tạo nhiều tiêu chí cha độc lập khó kiểm soát.

**How to apply:** Dòng không có nhóm khi tạo mới trở thành `heading`; dòng chọn nhóm trở thành `criterion`. Tiêu chí cũ vẫn là `criterion` dạng text để tương thích. Dữ liệu review checkbox phải lưu trạng thái `checked` riêng với `comment`, và mọi giao diện hiển thị review cần phân biệt hai loại. Màn hình học viên lấy `groupName` làm tiêu đề nhóm và chỉ hiển thị một `criteriaRating` tổng ở đầu, không lặp sao cho từng dòng con.