---
name: Admin Hub connection testing
description: Điều kiện cần để test claim cross-domain giữa EasyEdu và Admin Hub trên Replit.
---

Khi test claim cross-domain, phải dùng endpoint public/deployed và mã kết nối được sinh trong cùng môi trường/database mà endpoint đó đang đọc. Domain preview có thể bị Replit Shield redirect, còn mã tạo ở development có thể không tồn tại trong database production.

**Why:** Preview Admin Hub từng trả 307 tới Replit Shield khiến trình duyệt báo `Failed to fetch`; sau khi dùng public deployment, request đã tới API nhưng mã tạo ở môi trường khác trả `invalid_code`.

**How to apply:** Nếu gặp `Failed to fetch`, kiểm tra khả năng truy cập public và CORS trước. Nếu nhận `invalid_code` hoặc “Không tìm thấy mã kết nối”, tạo mã mới ngay trên môi trường tương ứng với endpoint đang test; không tự ghép hoặc dùng lại mã một lần.