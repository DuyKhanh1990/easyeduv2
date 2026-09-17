---
name: Evaluation criterion input types
description: Quy tắc thống nhất cho tiêu chí đánh giá dạng nhập text và tickbox
---

Mỗi tiêu chí con có loại riêng: `text` để giáo viên nhập nhận xét hoặc `checkbox` để giáo viên tick khi học viên đạt tiêu chí. Tiêu chí cha có thể chứa cả hai loại và được xem là dạng hỗn hợp.

**Why:** Đặt loại ở tiêu chí con cho phép một nhóm đánh giá tự do trộn nhận xét mở với các tiêu chí đạt/không đạt mà không cần tạo nhiều nhóm cha.

**How to apply:** Tiêu chí cũ mặc định là `text`; dữ liệu review checkbox phải lưu trạng thái `checked` riêng với `comment`, và mọi giao diện hiển thị review cần phân biệt hai loại.