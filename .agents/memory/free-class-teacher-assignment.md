---
name: Free-class teacher assignment precedence
description: Quy tắc phân công GV và ca cho lịch lớp tự do theo ngày và từng học viên.
---

Phân công hiệu lực của lớp tự do được chọn theo thứ tự: override của học viên trong ngày → phân công chung của ngày → GV/ca mặc định của lớp. Khi đã có override học viên hoặc phân công ngày, GV mặc định không được nhận buổi đó trong lịch cá nhân.

**Why:** Một ngày lớp tự do có thể có nhiều GV và ca khác nhau theo từng học viên; dùng GV chung làm fallback cho mọi bản ghi sẽ gửi lịch sai người.

**How to apply:** Các API lịch quản trị, lịch giáo viên, lịch học viên và chi tiết buổi phải cùng áp dụng thứ tự này; xóa override phải quay về tầng fallback kế tiếp.