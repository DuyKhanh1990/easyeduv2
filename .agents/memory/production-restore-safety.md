---
name: Production restore safety
description: Nguyên tắc quiescence và trạng thái atomic cho quy trình khôi phục database production.
---

Backup dự phòng trước restore chỉ an toàn khi mọi thao tác ghi đã vào được drain và mọi writer mới, kể cả tác vụ nền không qua HTTP, bị chặn cho tới khi snapshot hoàn tất.

**Why:** Một khoảng chờ cố định không tạo quiescent point; writer chạy lâu có thể commit sau snapshot và bị mất khi restore.

**How to apply:** Mọi writer do hệ thống kiểm soát (API, cron và gateway riêng) phải giữ shared advisory permit; restore giữ exclusive permit từ trước snapshot đến khi kết thúc.

Marker `finalizing` phải commit trong cùng transaction với dữ liệu restore. Chỉ đổi sang `completed` sau cleanup; startup/retry hoàn tất `finalizing` nhưng đánh dấu `running` bị gián đoạn là rollback.

**Why:** Nếu dữ liệu đã commit nhưng cleanup lỗi, không được báo nhầm restore thất bại hoặc khẳng định database đã rollback.

**How to apply:** Quyết định commit/rollback phải đọc marker từ kết nối mới, không dựa vào exit code của `psql`; nếu chưa đọc được thì giữ bảo trì và retry.