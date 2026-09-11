---
name: Admin Hub connection testing
description: Điều kiện cần để test claim cross-domain giữa EasyEdu và Admin Hub trên Replit.
---

Khi test claim cross-domain, phải dùng endpoint public/deployed và mã kết nối được sinh trong cùng môi trường/database mà endpoint đó đang đọc. Domain preview có thể bị Replit Shield redirect, còn mã tạo ở development có thể không tồn tại trong database production.

**Why:** Preview Admin Hub từng trả 307 tới Replit Shield khiến trình duyệt báo `Failed to fetch`; sau khi dùng public deployment, request đã tới API nhưng mã tạo ở môi trường khác trả `invalid_code`.

**How to apply:** Nếu gặp `Failed to fetch`, kiểm tra khả năng truy cập public và CORS trước. Nếu nhận `invalid_code` hoặc “Không tìm thấy mã kết nối”, tạo mã mới ngay trên môi trường tương ứng với endpoint đang test; không tự ghép hoặc dùng lại mã một lần.

Claim thành công hiện chỉ xác thực mã và thiết lập kết nối ban đầu; không đồng nghĩa EasyEdu đã gửi snapshot số liệu. Cần có credential/connection token được lưu phía server, service tổng hợp số liệu và endpoint nhận snapshot riêng trước khi có đồng bộ.

**Why:** Luồng hiện tại chỉ POST `{ code }` từ trang Admin và giữ trạng thái thành công trong phiên trình duyệt; không có lưu connection lâu dài hoặc request dữ liệu sau claim.

**How to apply:** Khi triển khai đồng bộ, không gửi dữ liệu tổng hợp trực tiếp từ browser; lấy số liệu từ server/database, gửi payload tối thiểu không chứa dữ liệu cá nhân, và cung cấp đồng bộ thủ công cùng lịch tự động nếu cần.