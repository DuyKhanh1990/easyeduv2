---
name: Free-class staff permissions
description: Staff calendar operations for flexible classes must honor teacher assignment separately from the /classes resource permission.
---

Lớp tự do trong lịch staff cho phép giáo viên hiệu lực của đúng đăng ký/ngày điểm danh, ghi chú và nhận xét mà không cần quyền resource `/classes`. Xác định giáo viên theo thứ tự: override của học viên, giáo viên được phân công cho ngày, rồi giáo viên mặc định của lớp. Override cụ thể cho giáo viên khác phải chặn giáo viên mặc định.

**Why:** Giáo viên có thể mở lịch staff theo phân công nhưng không có quyền quản trị danh sách lớp; đồng thời quyền theo lớp chung không được mở thao tác cho ngày/học viên đã được override sang giáo viên khác.

**How to apply:** Với điểm danh/ghi chú theo ngày, kiểm tra `studentClassId + registrationDate`; với nhận xét, kiểm tra `registrationId` và ngày đăng ký. Giữ các quyền quản trị hiện có, không mở rộng bypass phân công ngày sang các thao tác lịch khác. Giáo viên không phải người hiệu lực của bản ghi vẫn phải bị từ chối.