---
name: BIDV QR visibility
description: Quyết định về cờ hiển thị QR BIDV theo từng cơ sở.
---

`Bật QR` là cờ hiển thị riêng theo cơ sở, không đồng nghĩa với bật/tắt thanh toán BIDV và không được làm thay đổi Virtual Account, webhook, thanh toán hoặc đối soát. Khi tắt, chỉ ẩn tab QR BIDV trên màn hình hóa đơn; QR chuyển khoản thường vẫn hoạt động. Cấu hình cũ mặc định hiển thị QR để tránh thay đổi hành vi sau migration.

**Why:** Người dùng cần tạm ẩn QR BIDV của một cơ sở mà không dừng luồng nghiệp vụ hoặc tích hợp BIDV.

**How to apply:** Giữ `isQrEnabled` độc lập với `isEnabled`; các màn hình QR phải đọc trạng thái theo `invoice.locationId` và chỉ dùng nó cho phần hiển thị.